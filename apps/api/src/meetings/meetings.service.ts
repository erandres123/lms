import type {
  CreateMeetingInput,
  JoinMeetingResult,
  Meeting,
  MeetingList,
  MeetingParticipant,
  MeetingQuery,
} from '@lms/shared';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { WebhookEvent } from 'livekit-server-sdk';
import type { AuthUser } from '../auth/auth.types';
import { DatabaseService, type Database } from '../database/database.service';
import * as schema from '../database/schema';
import { SectionAccessService } from '../academic/section-access.service';
import { LiveKitProvider } from './livekit.provider';
import { buildRoomName, joinTtlSeconds, meetingRoleFor } from './meeting-policy';
import { toMeeting, toParticipant } from './meetings.mappers';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class MeetingsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: SectionAccessService,
    private readonly livekit: LiveKitProvider,
  ) {}

  list(user: AuthUser, sectionId: string, query: MeetingQuery): Promise<MeetingList> {
    return this.database.withTenant(user.tenantId, async (tx) => {
      const section = await this.access.requireSection(tx, user.tenantId, sectionId);
      await this.access.requireReadAccess(tx, user, section);

      const filters = [
        eq(schema.meetings.tenantId, user.tenantId),
        eq(schema.meetings.sectionId, section.id),
        query.from ? gte(schema.meetings.scheduledFor, new Date(query.from)) : undefined,
        query.to ? lte(schema.meetings.scheduledFor, new Date(query.to)) : undefined,
      ];

      const rows = await tx
        .select()
        .from(schema.meetings)
        .where(and(...filters))
        .orderBy(desc(schema.meetings.scheduledFor))
        .limit(100);

      return {
        providerConfigured: this.livekit.configured,
        meetings: rows.map((row) => toMeeting(row, this.livekit.configured)),
      };
    });
  }

  create(user: AuthUser, sectionId: string, input: CreateMeetingInput): Promise<Meeting> {
    return this.database.withTenant(user.tenantId, async (tx) => {
      const section = await this.access.requireSection(tx, user.tenantId, sectionId);
      this.access.requireWriteAccess(user, section);

      const scheduledFor = new Date(input.scheduledFor);
      const now = Date.now();
      if (scheduledFor.getTime() < now - 5 * 60_000) {
        throw new BadRequestException('scheduled time is in the past');
      }
      if (scheduledFor.getTime() > now + 365 * 24 * 60 * 60_000) {
        throw new BadRequestException('scheduled time is more than a year away');
      }

      const [row] = await tx
        .insert(schema.meetings)
        .values({
          tenantId: user.tenantId,
          sectionId: section.id,
          title: input.title.trim(),
          provider: 'livekit',
          roomName: buildRoomName(user.tenantId),
          scheduledFor,
          durationMinutes: input.durationMinutes,
          createdBy: user.userId,
          settings: { camerasOff: true, maxVideoHeight: 720 },
        })
        .returning();

      if (!row) throw new Error('failed to create meeting');
      await this.audit(tx, user, 'meeting.created', row.id, {
        title: row.title,
        scheduledFor: row.scheduledFor.toISOString(),
      });
      return toMeeting(row, this.livekit.configured);
    });
  }

  start(user: AuthUser, meetingId: string): Promise<Meeting> {
    return this.database.withTenant(user.tenantId, async (tx) => {
      const meeting = await this.findMeeting(tx, user.tenantId, meetingId);
      const section = await this.access.requireSection(tx, user.tenantId, meeting.sectionId);
      this.access.requireWriteAccess(user, section);

      if (meeting.status === 'live') return toMeeting(meeting, this.livekit.configured);
      if (meeting.status === 'ended' || meeting.status === 'cancelled') {
        throw new ConflictException('this meeting can no longer be started');
      }

      const [row] = await tx
        .update(schema.meetings)
        .set({
          status: 'live',
          startedAt: meeting.startedAt ?? new Date(),
          updatedAt: new Date(),
          version: meeting.version + 1,
        })
        .where(
          and(
            eq(schema.meetings.tenantId, user.tenantId),
            eq(schema.meetings.id, meeting.id),
          ),
        )
        .returning();

      if (!row) throw new Error('failed to start meeting');
      await this.audit(tx, user, 'meeting.started', row.id, { room: row.roomName });
      return toMeeting(row, this.livekit.configured);
    });
  }

  async end(user: AuthUser, meetingId: string): Promise<Meeting> {
    const result = await this.database.withTenant(user.tenantId, async (tx) => {
      const current = await this.findMeeting(tx, user.tenantId, meetingId);
      const section = await this.access.requireSection(tx, user.tenantId, current.sectionId);
      this.access.requireWriteAccess(user, section);

      if (current.status === 'ended') {
        return { meeting: toMeeting(current, this.livekit.configured), roomName: current.roomName };
      }

      const [row] = await tx
        .update(schema.meetings)
        .set({
          status: 'ended',
          endedAt: current.endedAt ?? new Date(),
          updatedAt: new Date(),
          version: current.version + 1,
        })
        .where(
          and(
            eq(schema.meetings.tenantId, user.tenantId),
            eq(schema.meetings.id, current.id),
          ),
        )
        .returning();

      if (!row) throw new Error('failed to end meeting');
      await this.audit(tx, user, 'meeting.ended', row.id, {});
      return { meeting: toMeeting(row, this.livekit.configured), roomName: row.roomName };
    });

    await this.livekit.deleteRoom(result.roomName);
    return result.meeting;
  }

  join(user: AuthUser, meetingId: string): Promise<JoinMeetingResult> {
    return this.database.withTenant(user.tenantId, async (tx) => {
      const meeting = await this.findMeeting(tx, user.tenantId, meetingId);
      const section = await this.access.requireSection(tx, user.tenantId, meeting.sectionId);
      await this.access.requireReadAccess(tx, user, section);

      if (meeting.provider !== 'livekit') {
        throw new BadRequestException('unsupported meeting provider');
      }
      if (meeting.status !== 'live') {
        throw new ForbiddenException('the teacher has not started this class');
      }

      const [account] = await tx
        .select({ displayName: schema.users.displayName, email: schema.users.email })
        .from(schema.users)
        .where(eq(schema.users.id, user.userId))
        .limit(1);

      let studentId: string | null = null;
      if (user.role === 'student') {
        const [student] = await tx
          .select({ id: schema.students.id })
          .from(schema.students)
          .where(
            and(
              eq(schema.students.tenantId, user.tenantId),
              eq(schema.students.userId, user.userId),
            ),
          )
          .limit(1);
        studentId = student?.id ?? null;
      }

      const role = meetingRoleFor(user.role);
      const token = await this.livekit.createJoinToken({
        identity: user.userId,
        name: account?.displayName ?? account?.email ?? 'Participant',
        role,
        appRole: user.role,
        roomName: meeting.roomName,
        ttlSeconds: joinTtlSeconds(new Date(), meeting),
        studentId,
      });

      return {
        url: this.livekit.publicUrl,
        token,
        roomName: meeting.roomName,
        role,
        meeting: toMeeting(meeting, this.livekit.configured),
      };
    });
  }

  participants(user: AuthUser, meetingId: string): Promise<MeetingParticipant[]> {
    return this.database.withTenant(user.tenantId, async (tx) => {
      const meeting = await this.findMeeting(tx, user.tenantId, meetingId);
      const section = await this.access.requireSection(tx, user.tenantId, meeting.sectionId);
      this.access.requireWriteAccess(user, section);

      const rows = await tx
        .select({ participant: schema.meetingParticipants, student: schema.students })
        .from(schema.meetingParticipants)
        .leftJoin(
          schema.students,
          eq(schema.students.id, schema.meetingParticipants.studentId),
        )
        .where(
          and(
            eq(schema.meetingParticipants.tenantId, user.tenantId),
            eq(schema.meetingParticipants.meetingId, meeting.id),
          ),
        )
        .orderBy(schema.meetingParticipants.firstJoinedAt);

      return rows.map((row) =>
        toParticipant(
          row.participant,
          row.student ? `${row.student.firstName} ${row.student.lastName}`.trim() : null,
        ),
      );
    });
  }

  async handleWebhook(event: WebhookEvent): Promise<void> {
    const roomName = event.room?.name;
    if (!roomName) return;

    const [meeting] = await this.database.db
      .select()
      .from(schema.meetings)
      .where(eq(schema.meetings.roomName, roomName))
      .limit(1);

    if (!meeting) return;

    const providerEventId =
      event.id ||
      `${event.event}:${roomName}:${String(event.createdAt)}:${event.participant?.identity ?? ''}`;
    const occurredAt =
      Number(event.createdAt) > 0
        ? new Date(Number(event.createdAt) * 1000)
        : new Date();

    await this.database.withTenant(meeting.tenantId, async (tx) => {
      const inserted = await tx
        .insert(schema.meetingEvents)
        .values({
          tenantId: meeting.tenantId,
          meetingId: meeting.id,
          provider: 'livekit',
          providerEventId,
          type: event.event,
          identity: event.participant?.identity ?? null,
          occurredAt,
          payload: {
            event: event.event,
            room: roomName,
            participant: event.participant?.identity ?? null,
          },
        })
        .onConflictDoNothing({
          target: [schema.meetingEvents.provider, schema.meetingEvents.providerEventId],
        })
        .returning({ id: schema.meetingEvents.id });

      const eventRow = inserted[0];
      if (!eventRow) return;

      if (event.event === 'room_finished') {
        await tx
          .update(schema.meetings)
          .set({
            status: 'ended',
            endedAt: sql`coalesce(${schema.meetings.endedAt}, ${occurredAt})`,
            updatedAt: new Date(),
            version: sql`${schema.meetings.version} + 1`,
          })
          .where(
            and(
              eq(schema.meetings.tenantId, meeting.tenantId),
              eq(schema.meetings.id, meeting.id),
              sql`${schema.meetings.status} <> 'ended'`,
            ),
          );
      }

      if (event.event === 'participant_joined') {
        await this.recordJoin(tx, meeting, event, occurredAt);
      }

      if (event.event === 'participant_left') {
        await this.recordLeave(tx, meeting, event, occurredAt);
      }

      await tx
        .update(schema.meetingEvents)
        .set({ processedAt: new Date() })
        .where(eq(schema.meetingEvents.id, eventRow.id));
    });
  }

  private async recordJoin(
    tx: Database,
    meeting: typeof schema.meetings.$inferSelect,
    event: WebhookEvent,
    occurredAt: Date,
  ): Promise<void> {
    const participant = event.participant;
    const identity = participant?.identity;
    if (!identity) return;

    const metadata = this.parseMetadata(participant?.metadata);
    const appRole = typeof metadata.appRole === 'string' ? metadata.appRole : 'unknown';
    const userId = uuidPattern.test(identity) ? identity : null;
    const joinedSeconds = Number(participant?.joinedAt ?? 0);
    const firstJoinedAt =
      joinedSeconds > 0 ? new Date(joinedSeconds * 1000) : occurredAt;

    let studentId: string | null =
      typeof metadata.studentId === 'string' ? metadata.studentId : null;
    if (!studentId && userId && appRole === 'student') {
      const [student] = await tx
        .select({ id: schema.students.id })
        .from(schema.students)
        .where(
          and(
            eq(schema.students.tenantId, meeting.tenantId),
            eq(schema.students.userId, userId),
          ),
        )
        .limit(1);
      studentId = student?.id ?? null;
    }

    await tx
      .insert(schema.meetingParticipants)
      .values({
        tenantId: meeting.tenantId,
        meetingId: meeting.id,
        userId,
        studentId,
        identity,
        displayName: participant?.name ?? null,
        role: appRole,
        firstJoinedAt,
      })
      .onConflictDoUpdate({
        target: [
          schema.meetingParticipants.meetingId,
          schema.meetingParticipants.identity,
        ],
        set: {
          userId,
          studentId,
          displayName: participant?.name ?? null,
          role: appRole,
          lastLeftAt: null,
          firstJoinedAt: sql`least(${schema.meetingParticipants.firstJoinedAt}, ${firstJoinedAt})`,
          updatedAt: new Date(),
        },
      });
  }

  private async recordLeave(
    tx: Database,
    meeting: typeof schema.meetings.$inferSelect,
    event: WebhookEvent,
    occurredAt: Date,
  ): Promise<void> {
    const identity = event.participant?.identity;
    if (!identity) return;

    const joinedSeconds = Number(event.participant?.joinedAt ?? 0);
    const seconds =
      joinedSeconds > 0
        ? Math.max(
            0,
            Math.min(24 * 60 * 60, Math.floor(occurredAt.getTime() / 1000) - joinedSeconds),
          )
        : 0;

    await tx.execute(sql`
      update ${schema.meetingParticipants}
      set last_left_at = ${occurredAt},
          total_seconds = total_seconds + ${seconds},
          updated_at = now()
      where meeting_id = ${meeting.id}
        and identity = ${identity}
        and tenant_id = ${meeting.tenantId}
    `);
  }

  private parseMetadata(value: string | undefined): Record<string, unknown> {
    if (!value) return {};
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  private async findMeeting(
    tx: Database,
    tenantId: string,
    meetingId: string,
  ): Promise<typeof schema.meetings.$inferSelect> {
    const [meeting] = await tx
      .select()
      .from(schema.meetings)
      .where(
        and(eq(schema.meetings.tenantId, tenantId), eq(schema.meetings.id, meetingId)),
      )
      .limit(1);

    if (!meeting) throw new NotFoundException('meeting not found');
    return meeting;
  }

  private async audit(
    tx: Database,
    user: AuthUser,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await tx.insert(schema.auditLog).values({
      tenantId: user.tenantId,
      actorId: user.userId,
      action,
      entity: 'meeting',
      entityId,
      metadata,
    });
  }
}
