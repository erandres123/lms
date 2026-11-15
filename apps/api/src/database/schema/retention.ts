import type { RetentionCategoryPlan, RetentionPolicy } from '@lms/shared';
import { index, integer, jsonb, pgEnum, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './tenancy';

export const retentionRunMode = pgEnum('retention_run_mode', ['dry_run']);

export const retentionRunTrigger = pgEnum('retention_run_trigger', ['manual', 'schedule']);

/**
 * Ledger of retention passes. The pilot writes dry runs only; rows here are
 * the evidence of what would have been removed and when.
 */
export const retentionRuns = pgTable(
  'retention_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    mode: retentionRunMode('mode').notNull().default('dry_run'),
    triggeredBy: retentionRunTrigger('triggered_by').notNull(),
    policy: jsonb('policy').$type<RetentionPolicy>().notNull(),
    categories: jsonb('categories').$type<RetentionCategoryPlan[]>().notNull().default([]),
    totalRows: integer('total_rows').notNull().default(0),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('retention_runs_tenant_started_idx').on(table.tenantId, table.startedAt)],
);
