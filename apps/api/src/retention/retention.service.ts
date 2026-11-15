import {
  EMPTY_RETENTION_POLICY,
  isRetentionEnabled,
  retentionPolicySchema,
  type RetentionCategoryKey,
  type RetentionCategoryPlan,
  type RetentionOverview,
  type RetentionPolicy,
  type RetentionRun,
  type RetentionRunTrigger,
  type RetentionSettings,
  type RetentionUpdateInput,
} from '@lms/shared';
import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { and, count, desc, eq, isNotNull, lt } from 'drizzle-orm';
import type { AuthUser } from '../auth/auth.types';
import { DatabaseService, type Database } from '../database/database.service';
import * as schema from '../database/schema';
import { isRetentionDue } from './retention.schedule';

const POLICY_KEY = 'retention.policy';
const DAY_MS = 86_400_000;
const RECENT_RUNS = 20;

const CATEGORY_LABELS: Record<RetentionCategoryKey, { label: string; table: string }> = {
  notificationsReadDays: { label: 'Read notifications', table: 'notifications' },
  staleDeviceDays: { label: 'Stale push devices', table: 'push_devices' },
  processedEventDays: { label: 'Processed meeting events', table: 'meeting_events' },
  syncReceiptDays: { label: 'Sync operation receipts', table: 'sync_operations' },
};

const CATEGORY_KEYS = Object.keys(CATEGORY_LABELS) as RetentionCategoryKey[];

interface TenantPolicyRow {
  tenantId: string;
  timezone: string;
  policy: unknown;
}

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(private readonly database: DatabaseService) {}

  overview(user: AuthUser): Promise<RetentionOverview> {
    return this.database.withTenant(user.tenantId, async (tx) => ({
      settings: await this.loadSettings(tx, user.tenantId),
      runs: await this.listRuns(tx, user.tenantId),
    }));
  }

  updatePolicy(user: AuthUser, input: RetentionUpdateInput): Promise<RetentionSettings> {
    return this.database.withTenant(user.tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(schema.tenantSettings)
        .where(
          and(
            eq(schema.tenantSettings.tenantId, user.tenantId),
            eq(schema.tenantSettings.key, POLICY_KEY),
          ),
        )
        .limit(1)
        .for('update');

      const currentVersion = existing?.version ?? 0;
      if (input.version !== undefined && input.version !== currentVersion) {
        throw new ConflictException('retention policy changed since it was loaded');
      }

      const previous = existing ? this.parsePolicy(existing.value) : { ...EMPTY_RETENTION_POLICY };
      const now = new Date();
      let version: number;

      if (existing) {
        version = existing.version + 1;
        await tx
          .update(schema.tenantSettings)
          .set({
            value: input.policy,
            version,
            updatedBy: user.userId,
            updatedAt: now,
          })
          .where(eq(schema.tenantSettings.id, existing.id));
      } else {
        version = 1;
        await tx.insert(schema.tenantSettings).values({
          tenantId: user.tenantId,
          key: POLICY_KEY,
          value: input.policy,
          version,
          updatedBy: user.userId,
        });
      }

      await tx.insert(schema.auditLog).values({
        tenantId: user.tenantId,
        actorId: user.userId,
        action: 'retention.policy_updated',
        entity: 'tenant_settings',
        entityId: POLICY_KEY,
        metadata: { version, previous, next: input.policy },
      });

      return { policy: input.policy, version, updatedAt: now.toISOString() };
    });
  }

  dryRun(user: AuthUser): Promise<RetentionRun> {
    return this.runDryRun(user.tenantId, 'manual', user.userId);
  }

  /**
   * Nightly pass for every tenant that has retention values configured.
   * Runs at most once per tenant-local day, after the configured run hour.
   */
  async runScheduled(now = new Date()): Promise<string[]> {
    const ran: string[] = [];
    for (const tenant of await this.tenantPolicies()) {
      const policy = this.parsePolicy(tenant.policy);
      if (!isRetentionEnabled(policy)) continue;

      const due = await this.database.withTenant(tenant.tenantId, async (tx) => {
        const [last] = await tx
          .select({ startedAt: schema.retentionRuns.startedAt })
          .from(schema.retentionRuns)
          .where(
            and(
              eq(schema.retentionRuns.tenantId, tenant.tenantId),
              eq(schema.retentionRuns.triggeredBy, 'schedule'),
            ),
          )
          .orderBy(desc(schema.retentionRuns.startedAt))
          .limit(1);

        return isRetentionDue(now, tenant.timezone, policy.runHour, last?.startedAt ?? null);
      });

      if (!due) continue;
      await this.runDryRun(tenant.tenantId, 'schedule', null, now);
      ran.push(tenant.tenantId);
    }

    return ran;
  }

  private runDryRun(
    tenantId: string,
    triggeredBy: RetentionRunTrigger,
    actorId: string | null,
    at = new Date(),
  ): Promise<RetentionRun> {
    return this.database.withTenant(tenantId, async (tx) => {
      const { policy } = await this.loadSettings(tx, tenantId);
      const categories: RetentionCategoryPlan[] = [];

      for (const key of CATEGORY_KEYS) {
        const days = policy[key];
        if (days === null) {
          categories.push({
            key,
            ...CATEGORY_LABELS[key],
            enabled: false,
            cutoff: null,
            rows: 0,
          });
          continue;
        }

        const cutoff = new Date(at.getTime() - days * DAY_MS);
        categories.push({
          key,
          ...CATEGORY_LABELS[key],
          enabled: true,
          cutoff: cutoff.toISOString(),
          rows: await this.countRows(tx, tenantId, key, cutoff),
        });
      }

      const totalRows = categories.reduce((sum, category) => sum + category.rows, 0);
      const [run] = await tx
        .insert(schema.retentionRuns)
        .values({
          tenantId,
          mode: 'dry_run',
          triggeredBy,
          policy,
          categories,
          totalRows,
          startedAt: at,
          finishedAt: at,
        })
        .returning();
      if (!run) throw new Error('failed to record retention run');

      await tx.insert(schema.auditLog).values({
        tenantId,
        actorId,
        action: 'retention.dry_run',
        entity: 'retention_run',
        entityId: run.id,
        metadata: {
          triggeredBy,
          totalRows,
          categories: categories
            .filter((category) => category.enabled)
            .map((category) => ({ key: category.key, rows: category.rows })),
        },
      });

      return this.toRun(run);
    });
  }

  /**
   * Cross-tenant read used only by the scheduler. The runtime role owns the
   * tables during the pilot; if a restricted app role lands, move this behind
   * a SECURITY DEFINER function.
   */
  private async tenantPolicies(): Promise<TenantPolicyRow[]> {
    const rows = await this.database.db
      .select({
        tenantId: schema.tenants.id,
        timezone: schema.tenants.timezone,
        policy: schema.tenantSettings.value,
      })
      .from(schema.tenants)
      .innerJoin(
        schema.tenantSettings,
        and(
          eq(schema.tenantSettings.tenantId, schema.tenants.id),
          eq(schema.tenantSettings.key, POLICY_KEY),
        ),
      );

    return rows;
  }

  private async loadSettings(tx: Database, tenantId: string): Promise<RetentionSettings> {
    const [row] = await tx
      .select()
      .from(schema.tenantSettings)
      .where(
        and(
          eq(schema.tenantSettings.tenantId, tenantId),
          eq(schema.tenantSettings.key, POLICY_KEY),
        ),
      )
      .limit(1);

    if (!row) {
      return { policy: { ...EMPTY_RETENTION_POLICY }, version: 0, updatedAt: null };
    }

    return {
      policy: this.parsePolicy(row.value),
      version: row.version,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async listRuns(tx: Database, tenantId: string): Promise<RetentionRun[]> {
    const rows = await tx
      .select()
      .from(schema.retentionRuns)
      .where(eq(schema.retentionRuns.tenantId, tenantId))
      .orderBy(desc(schema.retentionRuns.startedAt))
      .limit(RECENT_RUNS);

    return rows.map((row) => this.toRun(row));
  }

  private async countRows(
    tx: Database,
    tenantId: string,
    key: RetentionCategoryKey,
    cutoff: Date,
  ): Promise<number> {
    switch (key) {
      case 'notificationsReadDays': {
        const [row] = await tx
          .select({ value: count() })
          .from(schema.notifications)
          .where(
            and(
              eq(schema.notifications.tenantId, tenantId),
              isNotNull(schema.notifications.readAt),
              lt(schema.notifications.readAt, cutoff),
            ),
          );
        return Number(row?.value ?? 0);
      }
      case 'staleDeviceDays': {
        const [row] = await tx
          .select({ value: count() })
          .from(schema.pushDevices)
          .where(
            and(
              eq(schema.pushDevices.tenantId, tenantId),
              lt(schema.pushDevices.lastSeenAt, cutoff),
            ),
          );
        return Number(row?.value ?? 0);
      }
      case 'processedEventDays': {
        const [row] = await tx
          .select({ value: count() })
          .from(schema.meetingEvents)
          .where(
            and(
              eq(schema.meetingEvents.tenantId, tenantId),
              isNotNull(schema.meetingEvents.processedAt),
              lt(schema.meetingEvents.processedAt, cutoff),
            ),
          );
        return Number(row?.value ?? 0);
      }
      case 'syncReceiptDays': {
        const [row] = await tx
          .select({ value: count() })
          .from(schema.syncOperations)
          .where(
            and(
              eq(schema.syncOperations.tenantId, tenantId),
              lt(schema.syncOperations.createdAt, cutoff),
            ),
          );
        return Number(row?.value ?? 0);
      }
    }
  }

  private parsePolicy(value: unknown): RetentionPolicy {
    const parsed = retentionPolicySchema.safeParse(value);
    if (parsed.success) return parsed.data;
    this.logger.warn('Stored retention policy is invalid; falling back to defaults');
    return { ...EMPTY_RETENTION_POLICY };
  }

  private toRun(row: typeof schema.retentionRuns.$inferSelect): RetentionRun {
    return {
      id: row.id,
      mode: 'dry_run',
      triggeredBy: row.triggeredBy,
      totalRows: row.totalRows,
      categories: row.categories,
      startedAt: row.startedAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
    };
  }
}
