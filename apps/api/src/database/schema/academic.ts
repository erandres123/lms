import {
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenants, users } from './tenancy';

export const enrollmentStatus = pgEnum('enrollment_status', [
  'active',
  'transferred',
  'withdrawn',
]);

export const attendanceStatus = pgEnum('attendance_status', [
  'present',
  'absent',
  'late',
  'excused',
]);

export const students = pgTable(
  'students',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    lrn: text('lrn'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('students_tenant_lrn_key').on(table.tenantId, table.lrn),
    index('students_tenant_name_idx').on(table.tenantId, table.lastName, table.firstName),
  ],
);

export const sections = pgTable(
  'sections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    gradeLevel: smallint('grade_level').notNull(),
    schoolYear: text('school_year').notNull(),
    teacherId: uuid('teacher_id').references(() => users.id, { onDelete: 'set null' }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('sections_tenant_year_name_key').on(table.tenantId, table.schoolYear, table.name),
    index('sections_tenant_teacher_idx').on(table.tenantId, table.teacherId),
  ],
);

export const enrollments = pgTable(
  'enrollments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    sectionId: uuid('section_id')
      .notNull()
      .references(() => sections.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    status: enrollmentStatus('status').notNull().default('active'),
    version: integer('version').notNull().default(1),
    enrolledAt: timestamp('enrolled_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('enrollments_section_student_key').on(table.sectionId, table.studentId),
    index('enrollments_tenant_section_idx').on(table.tenantId, table.sectionId),
  ],
);

export const attendance = pgTable(
  'attendance',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    sectionId: uuid('section_id')
      .notNull()
      .references(() => sections.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    status: attendanceStatus('status').notNull(),
    note: text('note'),
    recordedBy: uuid('recorded_by').references(() => users.id, { onDelete: 'set null' }),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
    version: integer('version').notNull().default(1),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('attendance_section_student_date_key').on(
      table.sectionId,
      table.studentId,
      table.date,
    ),
    index('attendance_tenant_section_date_idx').on(table.tenantId, table.sectionId, table.date),
  ],
);
