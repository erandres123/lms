import {
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sections, students } from './academic';
import { tenants, users } from './tenancy';

export const gradingPeriods = pgTable(
  'grading_periods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    schoolYear: text('school_year').notNull(),
    sequence: smallint('sequence').notNull(),
    startsOn: date('starts_on', { mode: 'string' }),
    endsOn: date('ends_on', { mode: 'string' }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('grading_periods_tenant_year_sequence_key').on(
      table.tenantId,
      table.schoolYear,
      table.sequence,
    ),
  ],
);

export const gradeCategories = pgTable(
  'grade_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    sectionId: uuid('section_id')
      .notNull()
      .references(() => sections.id, { onDelete: 'cascade' }),
    periodId: uuid('period_id')
      .notNull()
      .references(() => gradingPeriods.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    weight: doublePrecision('weight').notNull(),
    sequence: smallint('sequence').notNull().default(1),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('grade_categories_section_period_name_key').on(
      table.sectionId,
      table.periodId,
      table.name,
    ),
    index('grade_categories_tenant_section_idx').on(table.tenantId, table.sectionId, table.periodId),
  ],
);

export const gradeItems = pgTable(
  'grade_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    sectionId: uuid('section_id')
      .notNull()
      .references(() => sections.id, { onDelete: 'cascade' }),
    periodId: uuid('period_id')
      .notNull()
      .references(() => gradingPeriods.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => gradeCategories.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    maxScore: doublePrecision('max_score').notNull(),
    competencyCode: text('competency_code'),
    dueDate: date('due_date', { mode: 'string' }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('grade_items_tenant_section_period_idx').on(
      table.tenantId,
      table.sectionId,
      table.periodId,
    ),
    index('grade_items_category_idx').on(table.categoryId),
  ],
);

export const grades = pgTable(
  'grades',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => gradeItems.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    score: doublePrecision('score').notNull(),
    enteredBy: uuid('entered_by').references(() => users.id, { onDelete: 'set null' }),
    version: integer('version').notNull().default(1),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('grades_item_student_key').on(table.itemId, table.studentId),
    index('grades_tenant_item_idx').on(table.tenantId, table.itemId),
  ],
);

export const gradeOverrides = pgTable(
  'grade_overrides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    sectionId: uuid('section_id')
      .notNull()
      .references(() => sections.id, { onDelete: 'cascade' }),
    periodId: uuid('period_id')
      .notNull()
      .references(() => gradingPeriods.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    grade: doublePrecision('grade').notNull(),
    reason: text('reason').notNull(),
    overriddenBy: uuid('overridden_by').references(() => users.id, { onDelete: 'set null' }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('grade_overrides_section_period_student_key').on(
      table.sectionId,
      table.periodId,
      table.studentId,
    ),
    index('grade_overrides_tenant_section_idx').on(
      table.tenantId,
      table.sectionId,
      table.periodId,
    ),
  ],
);
