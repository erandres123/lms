import { index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { students } from './academic';
import { tenants, users } from './tenancy';

export const consentStatus = pgEnum('consent_status', ['granted', 'withdrawn']);

/**
 * Links a parent/guardian account to the students they may act for. The
 * relationship is captured here so self-service consent records stay complete.
 */
export const guardianStudents = pgTable(
  'guardian_students',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    guardianUserId: uuid('guardian_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    relationship: text('relationship').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('guardian_students_tenant_guardian_student_key').on(
      table.tenantId,
      table.guardianUserId,
      table.studentId,
    ),
    index('guardian_students_tenant_student_idx').on(table.tenantId, table.studentId),
    index('guardian_students_guardian_idx').on(table.guardianUserId),
  ],
);


/**
 * Guardian consent history. Each capture pins the privacy-notice version the
 * guardian agreed to, so later notice edits never rewrite past consent.
 */
export const consentRecords = pgTable(
  'consent_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    noticeVersion: integer('notice_version').notNull(),
    status: consentStatus('status').notNull(),
    guardianName: text('guardian_name').notNull(),
    guardianRelationship: text('guardian_relationship').notNull(),
    guardianContact: text('guardian_contact'),
    note: text('note'),
    capturedBy: uuid('captured_by').references(() => users.id, { onDelete: 'set null' }),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('consent_records_tenant_student_idx').on(
      table.tenantId,
      table.studentId,
      table.capturedAt,
    ),
  ],
);
