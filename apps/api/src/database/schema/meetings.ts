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
import { sections, students } from './academic';
import { tenants, users } from './tenancy';

export const meetingStatus = pgEnum('meeting_status', [
  'scheduled',
  'live',
  'ended',
  'cancelled',
]);

export const meetings = pgTable(
  'meetings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    sectionId: uuid('section_id')
      .notNull()
      .references(() => sections.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    provider: text('provider').notNull().default('livekit'),
    roomName: text('room_name').notNull(),
    status: meetingStatus('status').notNull().default('scheduled'),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
    durationMinutes: integer('duration_minutes').notNull().default(60),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    settings: jsonb('settings')
      .$type<{ camerasOff?: boolean; maxVideoHeight?: number }>()
      .notNull()
      .default({}),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('meetings_tenant_room_key').on(table.tenantId, table.roomName),
    index('meetings_tenant_section_time_idx').on(
      table.tenantId,
      table.sectionId,
      table.scheduledFor,
    ),
  ],
);

export const meetingParticipants = pgTable(
  'meeting_participants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'set null' }),
    identity: text('identity').notNull(),
    displayName: text('display_name'),
    role: text('role').notNull(),
    firstJoinedAt: timestamp('first_joined_at', { withTimezone: true }).notNull(),
    lastLeftAt: timestamp('last_left_at', { withTimezone: true }),
    totalSeconds: integer('total_seconds').notNull().default(0),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('meeting_participants_meeting_identity_key').on(
      table.meetingId,
      table.identity,
    ),
    index('meeting_participants_tenant_meeting_idx').on(table.tenantId, table.meetingId),
  ],
);

export const meetingEvents = pgTable(
  'meeting_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull().default('livekit'),
    providerEventId: text('provider_event_id').notNull(),
    type: text('type').notNull(),
    identity: text('identity'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('meeting_events_provider_event_key').on(table.provider, table.providerEventId),
    index('meeting_events_tenant_meeting_idx').on(table.tenantId, table.meetingId, table.occurredAt),
  ],
);
