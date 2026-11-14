import type {
  NotificationKind,
  NotificationList,
  NotificationQuery,
  NotificationView,
  RegisterPushDeviceInput,
} from '@lms/shared';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import type { AuthUser } from '../auth/auth.types';
import { DatabaseService, type Database } from '../database/database.service';
import * as schema from '../database/schema';
import {
  classStartingNotification,
  dedupeKeys,
} from './notification-copy';
import { classStartingRecipients } from './notification-recipients';
import { PUSH_SENDER, type PushResult, type PushSender } from './push-sender';

export interface CreateNotificationsInput {
  tenantId: string;
  userIds: string[];
  kind: NotificationKind;
  title: string;
  body: string;
  data: Record<string, string>;
  dedupeKey: string;
}

const CLASS_STARTING_WINDOW_MS = 15 * 60_000;

function toNotificationView(
  row: typeof schema.notifications.$inferSelect,
): NotificationView {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    data: row.data,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function formatStartTime(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(instant);
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly database: DatabaseService,
    @Inject(PUSH_SENDER) private readonly sender: PushSender,
  ) {}

  registerDevice(
    user: AuthUser,
    input: RegisterPushDeviceInput,
  ): Promise<{ id: string; platform: string }> {
    return this.database.withTenant(user.tenantId, async (tx) => {
      const [row] = await tx
        .insert(schema.pushDevices)
        .values({
          tenantId: user.tenantId,
          userId: user.userId,
          platform: input.platform,
          token: input.token,
        })
        .onConflictDoUpdate({
          target: schema.pushDevices.token,
          set: {
            tenantId: user.tenantId,
            userId: user.userId,
            platform: input.platform,
            lastSeenAt: new Date(),
          },
        })
        .returning({ id: schema.pushDevices.id, platform: schema.pushDevices.platform });

      if (!row) throw new Error('failed to register push device');
      return row;
    });
  }

  removeDevice(user: AuthUser, deviceId: string): Promise<{ removed: true }> {
    return this.database.withTenant(user.tenantId, async (tx) => {
      const removed = await tx
        .delete(schema.pushDevices)
        .where(
          and(
            eq(schema.pushDevices.id, deviceId),
            eq(schema.pushDevices.tenantId, user.tenantId),
            eq(schema.pushDevices.userId, user.userId),
          ),
        )
        .returning({ id: schema.pushDevices.id });

      if (removed.length === 0) throw new NotFoundException('push device not found');
      return { removed: true as const };
    });
  }

  list(user: AuthUser, query: NotificationQuery): Promise<NotificationList> {
    return this.database.withTenant(user.tenantId, async (tx) => {
      const filters = [
        eq(schema.notifications.tenantId, user.tenantId),
        eq(schema.notifications.userId, user.userId),
        query.unreadOnly ? isNull(schema.notifications.readAt) : undefined,
      ];

      const rows = await tx
        .select()
        .from(schema.notifications)
        .where(and(...filters))
        .orderBy(desc(schema.notifications.createdAt))
        .limit(query.limit);

      const [unread] = await tx
        .select({ value: count() })
        .from(schema.notifications)
        .where(
          and(
            eq(schema.notifications.tenantId, user.tenantId),
            eq(schema.notifications.userId, user.userId),
            isNull(schema.notifications.readAt),
          ),
        );

      return {
        items: rows.map(toNotificationView),
        unreadCount: unread?.value ?? 0,
      };
    });
  }

  markRead(user: AuthUser, notificationId: string): Promise<NotificationView> {
    return this.database.withTenant(user.tenantId, async (tx) => {
      const [row] = await tx
        .update(schema.notifications)
        .set({ readAt: sql`coalesce(${schema.notifications.readAt}, now())` })
        .where(
          and(
            eq(schema.notifications.id, notificationId),
            eq(schema.notifications.tenantId, user.tenantId),
            eq(schema.notifications.userId, user.userId),
          ),
        )
        .returning();

      if (!row) throw new NotFoundException('notification not found');
      return toNotificationView(row);
    });
  }

  /** Writes inbox rows inside the caller's tenant transaction, deduped per user. */
  async createInTx(tx: Database, input: CreateNotificationsInput): Promise<string[]> {
    if (input.userIds.length === 0) return [];

    const inserted = await tx
      .insert(schema.notifications)
      .values(
        input.userIds.map((userId) => ({
          tenantId: input.tenantId,
          userId,
          kind: input.kind,
          title: input.title,
          body: input.body,
          data: input.data,
          dedupeKey: `${input.dedupeKey}:${userId}`,
        })),
      )
      .onConflictDoNothing({
        target: [
          schema.notifications.tenantId,
          schema.notifications.userId,
          schema.notifications.dedupeKey,
        ],
      })
      .returning({ id: schema.notifications.id });

    return inserted.map((row) => row.id);
  }

  /** Best-effort delivery; inbox rows stay readable when push is unavailable. */
  async dispatch(notificationIds: string[]): Promise<void> {
    if (notificationIds.length === 0) return;

    try {
      await this.deliver(notificationIds);
    } catch (error) {
      // The source write already committed; never fail it on delivery errors.
      this.logger.warn(`Push dispatch failed: ${String(error)}`);
    }
  }

  private async deliver(notificationIds: string[]): Promise<void> {
    const rows = await this.database.db
      .select()
      .from(schema.notifications)
      .where(
        and(
          inArray(schema.notifications.id, notificationIds),
          eq(schema.notifications.pushStatus, 'pending'),
        ),
      );

    for (const row of rows) {
      const devices = await this.database.db
        .select()
        .from(schema.pushDevices)
        .where(
          and(
            eq(schema.pushDevices.tenantId, row.tenantId),
            eq(schema.pushDevices.userId, row.userId),
          ),
        );

      if (devices.length === 0) {
        await this.markPush(row.id, 'skipped', 'no registered devices');
        continue;
      }

      if (!this.sender.configured) {
        await this.markPush(row.id, 'skipped', 'push provider not configured');
        continue;
      }

      let delivered = 0;
      const errors: string[] = [];

      for (const device of devices) {
        let result: PushResult;
        try {
          result = await this.sender.send({
            token: device.token,
            platform: device.platform,
            title: row.title,
            body: row.body,
            data: row.data,
          });
        } catch (error) {
          errors.push(String(error));
          continue;
        }

        if (result.ok) {
          delivered += 1;
          continue;
        }

        errors.push(result.error);
        if (result.permanent) {
          await this.database.db
            .delete(schema.pushDevices)
            .where(eq(schema.pushDevices.id, device.id));
        }
      }

      if (delivered > 0) {
        await this.markPush(row.id, 'sent', null);
      } else {
        await this.markPush(row.id, 'failed', errors.slice(0, 3).join('; '));
      }
    }
  }

  /**
   * Enqueues the 15-minute class reminder for scheduled meetings. Dedupe keys
   * make repeated sweeps idempotent.
   */
  async sweepClassStarting(now = new Date()): Promise<number> {
    const until = new Date(now.getTime() + CLASS_STARTING_WINDOW_MS);

    const due = await this.database.db
      .select({
        meeting: schema.meetings,
        sectionName: schema.sections.name,
        teacherId: schema.sections.teacherId,
        timezone: schema.tenants.timezone,
      })
      .from(schema.meetings)
      .innerJoin(schema.sections, eq(schema.sections.id, schema.meetings.sectionId))
      .innerJoin(schema.tenants, eq(schema.tenants.id, schema.meetings.tenantId))
      .where(
        and(
          eq(schema.meetings.status, 'scheduled'),
          gte(schema.meetings.scheduledFor, now),
          lte(schema.meetings.scheduledFor, until),
        ),
      );

    const createdIds: string[] = [];

    for (const { meeting, sectionName, teacherId, timezone } of due) {
      const copy = classStartingNotification({
        sectionName,
        meetingTitle: meeting.title,
        startsAt: formatStartTime(meeting.scheduledFor, timezone),
        minutesUntilStart: (meeting.scheduledFor.getTime() - now.getTime()) / 60_000,
      });

      const ids = await this.database.withTenant(meeting.tenantId, async (tx) => {
        const enrolled = await tx
          .select({ userId: schema.students.userId })
          .from(schema.enrollments)
          .innerJoin(
            schema.students,
            eq(schema.students.id, schema.enrollments.studentId),
          )
          .where(
            and(
              eq(schema.enrollments.tenantId, meeting.tenantId),
              eq(schema.enrollments.sectionId, meeting.sectionId),
              eq(schema.enrollments.status, 'active'),
            ),
          );

        const userIds = classStartingRecipients({
          teacherId,
          studentUserIds: enrolled.map((row) => row.userId),
        });

        return this.createInTx(tx, {
          tenantId: meeting.tenantId,
          userIds,
          kind: 'class_starting',
          title: copy.title,
          body: copy.body,
          data: {
            kind: 'class_starting',
            sectionId: meeting.sectionId,
            meetingId: meeting.id,
          },
          dedupeKey: dedupeKeys.classStarting(meeting.id),
        });
      });

      createdIds.push(...ids);
    }

    await this.dispatch(createdIds);
    return createdIds.length;
  }

  private async markPush(
    id: string,
    status: 'sent' | 'skipped' | 'failed',
    error: string | null,
  ): Promise<void> {
    await this.database.db
      .update(schema.notifications)
      .set({
        pushStatus: status,
        pushAttempts: sql`${schema.notifications.pushAttempts} + 1`,
        pushError: error,
        sentAt: status === 'sent' ? new Date() : null,
      })
      .where(eq(schema.notifications.id, id));
  }
}
