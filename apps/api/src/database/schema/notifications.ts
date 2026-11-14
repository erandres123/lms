import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenants, users } from './tenancy';

export const pushPlatform = pgEnum('push_platform', ['android', 'ios', 'web']);

export const notificationKind = pgEnum('notification_kind', [
  'grade_posted',
  'absence_marked',
  'class_starting',
]);

export const notificationPushStatus = pgEnum('notification_push_status', [
  'pending',
  'sent',
  'skipped',
  'failed',
]);

export const pushDevices = pgTable(
  'push_devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    platform: pushPlatform('platform').notNull(),
    token: text('token').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('push_devices_token_key').on(table.token),
    index('push_devices_tenant_user_idx').on(table.tenantId, table.userId),
  ],
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: notificationKind('kind').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    data: jsonb('data').$type<Record<string, string>>().notNull().default({}),
    dedupeKey: text('dedupe_key'),
    readAt: timestamp('read_at', { withTimezone: true }),
    pushStatus: notificationPushStatus('push_status').notNull().default('pending'),
    pushAttempts: integer('push_attempts').notNull().default(0),
    pushError: text('push_error'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('notifications_tenant_user_dedupe_key').on(
      table.tenantId,
      table.userId,
      table.dedupeKey,
    ),
    index('notifications_tenant_user_created_idx').on(
      table.tenantId,
      table.userId,
      table.createdAt,
    ),
    index('notifications_push_status_idx').on(table.pushStatus, table.createdAt),
  ],
);
