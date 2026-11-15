import { index, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { students } from './academic';
import { tenants, users } from './tenancy';

export const consentStatus = pgEnum('consent_status', ['granted', 'withdrawn']);

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
