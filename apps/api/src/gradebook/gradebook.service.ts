import type {
  CreateGradeCategoryInput,
  CreateGradeItemInput,
  CreateGradingPeriodInput,
  GradeOverrideInput,
  SaveGradesInput,
} from '@lms/shared';
import { TRANSMUTATION_POLICY, transmuteInitialGrade } from '@lms/shared';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import { SectionAccessService } from '../academic/section-access.service';
import { toSection } from '../academic/academic.mappers';
import type { AuthUser } from '../auth/auth.types';
import { DatabaseService, type Database } from '../database/database.service';
import * as schema from '../database/schema';
import {
  gradePostedNotification,
  dedupeKeys,
} from '../notifications/notification-copy';
import { NotificationsService } from '../notifications/notifications.service';
import {
  toGrade,
  toGradeCategory,
  toGradeItem,
  toGradeOverride,
  toGradingPeriod,
  type GradeCategoryRow,
  type GradingPeriodRow,
} from './gradebook.mappers';

const round2 = (value: number) => Math.round(value * 100) / 100;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

@Injectable()
export class GradebookService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: SectionAccessService,
    private readonly notifications: NotificationsService,
  ) {}

  listPeriods(user: AuthUser) {
    return this.database.withTenant(user.tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(schema.gradingPeriods)
        .where(eq(schema.gradingPeriods.tenantId, user.tenantId))
        .orderBy(asc(schema.gradingPeriods.schoolYear), asc(schema.gradingPeriods.sequence));
      return rows.map(toGradingPeriod);
    });
  }

  createPeriod(user: AuthUser, input: CreateGradingPeriodInput) {
    return this.database.withTenant(user.tenantId, async (tx) => {
      if (input.startsOn && input.endsOn && input.startsOn > input.endsOn) {
        throw new BadRequestException('startsOn must be before endsOn');
      }

      const [row] = await tx
        .insert(schema.gradingPeriods)
        .values({
          tenantId: user.tenantId,
          name: input.name,
          schoolYear: input.schoolYear,
          sequence: input.sequence,
          startsOn: input.startsOn ?? null,
          endsOn: input.endsOn ?? null,
        })
        .returning();

      if (!row) throw new Error('failed to create grading period');
      await this.audit(tx, user, 'grading_period.created', 'grading_period', row.id, {
        name: row.name,
        sequence: row.sequence,
      });
      return toGradingPeriod(row);
    });
  }

  createCategory(user: AuthUser, sectionId: string, input: CreateGradeCategoryInput) {
    return this.database.withTenant(user.tenantId, async (tx) => {
      const section = await this.access.requireSection(tx, user.tenantId, sectionId);
      this.access.requireWriteAccess(user, section);
      await this.requirePeriod(tx, user.tenantId, input.periodId);

      try {
        const [row] = await tx
          .insert(schema.gradeCategories)
          .values({
            tenantId: user.tenantId,
            sectionId: section.id,
            periodId: input.periodId,
            name: input.name,
            weight: input.weight,
            sequence: input.sequence,
          })
          .returning();

        if (!row) throw new Error('failed to create grade category');
        await this.audit(tx, user, 'grade_category.created', 'section', section.id, {
          categoryId: row.id,
          name: row.name,
          weight: row.weight,
        });
        return toGradeCategory(row);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictException('a category with that name already exists in this period');
        }
        throw error;
      }
    });
  }

  createItem(user: AuthUser, sectionId: string, input: CreateGradeItemInput) {
    return this.database.withTenant(user.tenantId, async (tx) => {
      const section = await this.access.requireSection(tx, user.tenantId, sectionId);
      this.access.requireWriteAccess(user, section);
      await this.requirePeriod(tx, user.tenantId, input.periodId);

      const [category] = await tx
        .select()
        .from(schema.gradeCategories)
        .where(
          and(
            eq(schema.gradeCategories.id, input.categoryId),
            eq(schema.gradeCategories.tenantId, user.tenantId),
            eq(schema.gradeCategories.sectionId, section.id),
            eq(schema.gradeCategories.periodId, input.periodId),
          ),
        )
        .limit(1);

      if (!category) {
        throw new BadRequestException('category does not belong to this section and period');
      }

      const [row] = await tx
        .insert(schema.gradeItems)
        .values({
          tenantId: user.tenantId,
          sectionId: section.id,
          periodId: input.periodId,
          categoryId: category.id,
          title: input.title,
          maxScore: input.maxScore,
          competencyCode: input.competencyCode ?? null,
          dueDate: input.dueDate ?? null,
        })
        .returning();

      if (!row) throw new Error('failed to create grade item');
      await this.audit(tx, user, 'grade_item.created', 'section', section.id, {
        itemId: row.id,
        title: row.title,
        maxScore: row.maxScore,
      });
      return toGradeItem(row);
    });
  }

  async saveGrades(
    user: AuthUser,
    sectionId: string,
    input: SaveGradesInput,
  ): Promise<ReturnType<typeof toGrade>[]> {
    const result = await this.database.withTenant(user.tenantId, async (tx) => {
      const section = await this.access.requireSection(tx, user.tenantId, sectionId);
      this.access.requireWriteAccess(user, section);

      const [item] = await tx
        .select()
        .from(schema.gradeItems)
        .where(
          and(
            eq(schema.gradeItems.id, input.itemId),
            eq(schema.gradeItems.tenantId, user.tenantId),
            eq(schema.gradeItems.sectionId, section.id),
          ),
        )
        .limit(1);

      if (!item) throw new NotFoundException('grade item not found');

      const ids = input.entries.map((entry) => entry.studentId);
      if (new Set(ids).size !== ids.length) {
        throw new BadRequestException('duplicate studentId in grade entries');
      }

      for (const entry of input.entries) {
        if (entry.score > item.maxScore) {
          throw new BadRequestException(
            `score for ${entry.studentId} exceeds the item maximum of ${item.maxScore}`,
          );
        }
      }

      const enrolled = await tx
        .select({ studentId: schema.enrollments.studentId })
        .from(schema.enrollments)
        .where(
          and(
            eq(schema.enrollments.tenantId, user.tenantId),
            eq(schema.enrollments.sectionId, section.id),
            eq(schema.enrollments.status, 'active'),
            inArray(schema.enrollments.studentId, ids),
          ),
        );

      if (enrolled.length !== ids.length) {
        throw new BadRequestException('one or more students are not active in this section');
      }

      for (const entry of input.entries) {
        const baseVersion = entry.baseVersion ?? null;
        const result = await tx.execute(sql`
          insert into ${schema.grades}
            (tenant_id, item_id, student_id, score, entered_by)
          values
            (${user.tenantId}, ${item.id}, ${entry.studentId}, ${entry.score}, ${user.userId})
          on conflict (item_id, student_id) do update
            set score = excluded.score,
                entered_by = excluded.entered_by,
                recorded_at = now(),
                version = grades.version + 1
            where grades.tenant_id = ${user.tenantId}
              and (${baseVersion}::int is null or grades.version = ${baseVersion})
          returning id
        `);

        if ((result.rowCount ?? 0) === 0) {
          const [current] = await tx
            .select()
            .from(schema.grades)
            .where(
              and(
                eq(schema.grades.tenantId, user.tenantId),
                eq(schema.grades.itemId, item.id),
                eq(schema.grades.studentId, entry.studentId),
              ),
            )
            .limit(1);

          throw new ConflictException({
            message: 'grade changed on the server; refresh and retry',
            studentId: entry.studentId,
            current: current ? toGrade(current) : null,
          });
        }
      }

      await this.audit(tx, user, 'grades.saved', 'section', section.id, {
        itemId: item.id,
        entries: input.entries.length,
      });

      const studentRows = await tx
        .select({ id: schema.students.id, userId: schema.students.userId })
        .from(schema.students)
        .where(
          and(
            eq(schema.students.tenantId, user.tenantId),
            inArray(schema.students.id, ids),
          ),
        );

      const userIdByStudent = new Map<string, string>();
      for (const row of studentRows) {
        if (row.userId) userIdByStudent.set(row.id, row.userId);
      }

      const notificationIds: string[] = [];
      for (const entry of input.entries) {
        const userId = userIdByStudent.get(entry.studentId);
        if (!userId) continue;

        const copy = gradePostedNotification({
          sectionName: section.name,
          itemTitle: item.title,
          score: entry.score,
          maxScore: item.maxScore,
        });
        const created = await this.notifications.createInTx(tx, {
          tenantId: user.tenantId,
          userIds: [userId],
          kind: 'grade_posted',
          title: copy.title,
          body: copy.body,
          data: {
            kind: 'grade_posted',
            sectionId: section.id,
            itemId: item.id,
          },
          dedupeKey: dedupeKeys.gradePosted(item.id),
        });
        notificationIds.push(...created);
      }

      const rows = await tx
        .select()
        .from(schema.grades)
        .where(
          and(
            eq(schema.grades.tenantId, user.tenantId),
            eq(schema.grades.itemId, item.id),
          ),
        )
        .orderBy(schema.grades.studentId);

      return { grades: rows.map(toGrade), notificationIds };
    });

    await this.notifications.dispatch(result.notificationIds);
    return result.grades;
  }

  setOverride(user: AuthUser, sectionId: string, input: GradeOverrideInput) {
    return this.database.withTenant(user.tenantId, async (tx) => {
      const section = await this.access.requireSection(tx, user.tenantId, sectionId);
      await this.requirePeriod(tx, user.tenantId, input.periodId);

      const [enrollment] = await tx
        .select({ id: schema.enrollments.id })
        .from(schema.enrollments)
        .where(
          and(
            eq(schema.enrollments.tenantId, user.tenantId),
            eq(schema.enrollments.sectionId, section.id),
            eq(schema.enrollments.status, 'active'),
            eq(schema.enrollments.studentId, input.studentId),
          ),
        )
        .limit(1);

      if (!enrollment) {
        throw new BadRequestException('student is not active in this section');
      }

      const baseVersion = input.baseVersion ?? null;
      const result = await tx.execute(sql`
        insert into ${schema.gradeOverrides}
          (tenant_id, section_id, period_id, student_id, grade, reason, overridden_by)
        values
          (${user.tenantId}, ${section.id}, ${input.periodId}, ${input.studentId},
           ${input.grade}, ${input.reason}, ${user.userId})
        on conflict (section_id, period_id, student_id) do update
          set grade = excluded.grade,
              reason = excluded.reason,
              overridden_by = excluded.overridden_by,
              version = grade_overrides.version + 1
          where grade_overrides.tenant_id = ${user.tenantId}
            and (${baseVersion}::int is null or grade_overrides.version = ${baseVersion})
        returning id
      `);

      if ((result.rowCount ?? 0) === 0) {
        const [current] = await tx
          .select()
          .from(schema.gradeOverrides)
          .where(
            and(
              eq(schema.gradeOverrides.tenantId, user.tenantId),
              eq(schema.gradeOverrides.sectionId, section.id),
              eq(schema.gradeOverrides.periodId, input.periodId),
              eq(schema.gradeOverrides.studentId, input.studentId),
            ),
          )
          .limit(1);

        throw new ConflictException({
          message: 'grade override changed on the server; refresh and retry',
          studentId: input.studentId,
          current: current ? toGradeOverride(current) : null,
        });
      }

      await this.audit(tx, user, 'grade_override.set', 'section', section.id, {
        periodId: input.periodId,
        studentId: input.studentId,
        grade: input.grade,
        reason: input.reason,
      });

      const [row] = await tx
        .select()
        .from(schema.gradeOverrides)
        .where(
          and(
            eq(schema.gradeOverrides.tenantId, user.tenantId),
            eq(schema.gradeOverrides.sectionId, section.id),
            eq(schema.gradeOverrides.periodId, input.periodId),
            eq(schema.gradeOverrides.studentId, input.studentId),
          ),
        )
        .limit(1);

      if (!row) throw new Error('failed to read grade override');
      return toGradeOverride(row);
    });
  }

  getGradebook(user: AuthUser, sectionId: string, periodId: string) {
    return this.database.withTenant(user.tenantId, async (tx) => {
      const section = await this.access.requireSection(tx, user.tenantId, sectionId);
      await this.access.requireReadAccess(tx, user, section);
      const period = await this.requirePeriod(tx, user.tenantId, periodId);

      const [school] = await tx
        .select({ id: schema.tenants.id, name: schema.tenants.name })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, user.tenantId))
        .limit(1);

      let adviserName: string | null = null;
      if (section.teacherId) {
        const [adviser] = await tx
          .select({ displayName: schema.users.displayName, email: schema.users.email })
          .from(schema.users)
          .where(eq(schema.users.id, section.teacherId))
          .limit(1);
        adviserName = adviser?.displayName ?? adviser?.email ?? null;
      }

      const categories = await tx
        .select()
        .from(schema.gradeCategories)
        .where(
          and(
            eq(schema.gradeCategories.tenantId, user.tenantId),
            eq(schema.gradeCategories.sectionId, section.id),
            eq(schema.gradeCategories.periodId, periodId),
          ),
        )
        .orderBy(asc(schema.gradeCategories.sequence), asc(schema.gradeCategories.name));

      const items = await tx
        .select()
        .from(schema.gradeItems)
        .where(
          and(
            eq(schema.gradeItems.tenantId, user.tenantId),
            eq(schema.gradeItems.sectionId, section.id),
            eq(schema.gradeItems.periodId, periodId),
          ),
        )
        .orderBy(asc(schema.gradeItems.createdAt));

      const itemIds = items.map((item) => item.id);
      const gradeRows =
        itemIds.length > 0
          ? await tx
              .select()
              .from(schema.grades)
              .where(
                and(
                  eq(schema.grades.tenantId, user.tenantId),
                  inArray(schema.grades.itemId, itemIds),
                ),
              )
          : [];

      let enrollments = await tx
        .select({ enrollment: schema.enrollments, student: schema.students })
        .from(schema.enrollments)
        .innerJoin(schema.students, eq(schema.students.id, schema.enrollments.studentId))
        .where(
          and(
            eq(schema.enrollments.tenantId, user.tenantId),
            eq(schema.enrollments.sectionId, section.id),
            eq(schema.enrollments.status, 'active'),
          ),
        )
        .orderBy(asc(schema.students.lastName), asc(schema.students.firstName));

      const overrides = await tx
        .select()
        .from(schema.gradeOverrides)
        .where(
          and(
            eq(schema.gradeOverrides.tenantId, user.tenantId),
            eq(schema.gradeOverrides.sectionId, section.id),
            eq(schema.gradeOverrides.periodId, periodId),
          ),
        );

      if (user.role === 'student') {
        const [own] = await tx
          .select({ id: schema.students.id })
          .from(schema.students)
          .where(
            and(
              eq(schema.students.tenantId, user.tenantId),
              eq(schema.students.userId, user.userId),
            ),
          )
          .limit(1);

        enrollments = own
          ? enrollments.filter((row) => row.student.id === own.id)
          : [];
      }

      const itemsByCategory = new Map<string, typeof items>();
      for (const item of items) {
        const list = itemsByCategory.get(item.categoryId) ?? [];
        list.push(item);
        itemsByCategory.set(item.categoryId, list);
      }

      const gradeByItemStudent = new Map<string, { score: number; version: number }>();
      for (const grade of gradeRows) {
        gradeByItemStudent.set(`${grade.itemId}:${grade.studentId}`, {
          score: grade.score,
          version: grade.version,
        });
      }

      const overrideByStudent = new Map(overrides.map((row) => [row.studentId, row]));
      const weightByCategory = new Map(categories.map((row) => [row.id, row.weight]));

      const students = enrollments.map(({ student }) => {
        const categoryResults = categories.map((category) => {
          const categoryItems = itemsByCategory.get(category.id) ?? [];
          let earned = 0;
          let possible = 0;

          // Ungraded items count as zero so the denominator stays stable and
          // incomplete work is visible in the grade instead of silently ignored.
          for (const item of categoryItems) {
            possible += item.maxScore;
            earned += gradeByItemStudent.get(`${item.id}:${student.id}`)?.score ?? 0;
          }

          return {
            categoryId: category.id,
            percentage: possible > 0 ? round2((earned / possible) * 100) : null,
            earned: round2(earned),
            possible: round2(possible),
          };
        });

        const scored = categoryResults.filter(
          (result): result is { categoryId: string; percentage: number; earned: number; possible: number } =>
            result.percentage !== null,
        );
        const weightTotal = scored.reduce(
          (sum, result) => sum + (weightByCategory.get(result.categoryId) ?? 0),
          0,
        );
        const percentage =
          weightTotal > 0
            ? round2(
                scored.reduce(
                  (sum, result) =>
                    sum + result.percentage * (weightByCategory.get(result.categoryId) ?? 0),
                  0,
                ) / weightTotal,
              )
            : null;

        const override = overrideByStudent.get(student.id);
        const transmutedGrade = percentage === null ? null : transmuteInitialGrade(percentage);

        const scores: Record<string, { score: number; version: number }> = {};
        for (const item of items) {
          const grade = gradeByItemStudent.get(`${item.id}:${student.id}`);
          if (grade) scores[item.id] = grade;
        }

        return {
          studentId: student.id,
          lrn: student.lrn,
          firstName: student.firstName,
          lastName: student.lastName,
          categories: categoryResults,
          scores,
          percentage,
          transmutedGrade,
          effectiveGrade: override ? round2(override.grade) : transmutedGrade,
          override: override ? toGradeOverride(override) : null,
        };
      });

      return {
        school: {
          id: school?.id ?? user.tenantId,
          name: school?.name ?? '',
        },
        adviserName,
        section: toSection(section),
        period: toGradingPeriod(period),
        transmutationPolicy: TRANSMUTATION_POLICY,
        weightsTotal: round2(categories.reduce((sum, category) => sum + category.weight, 0)),
        categories: categories.map((category: GradeCategoryRow) => ({
          id: category.id,
          name: category.name,
          weight: category.weight,
          sequence: category.sequence,
          items: (itemsByCategory.get(category.id) ?? []).map((item) => ({
            id: item.id,
            title: item.title,
            maxScore: item.maxScore,
            competencyCode: item.competencyCode,
            dueDate: item.dueDate,
          })),
        })),
        students,
      };
    });
  }

  getCompetencies(user: AuthUser, sectionId: string, periodId: string) {
    return this.database.withTenant(user.tenantId, async (tx) => {
      const section = await this.access.requireSection(tx, user.tenantId, sectionId);
      await this.access.requireReadAccess(tx, user, section);
      const period = await this.requirePeriod(tx, user.tenantId, periodId);

      const items = await tx
        .select()
        .from(schema.gradeItems)
        .where(
          and(
            eq(schema.gradeItems.tenantId, user.tenantId),
            eq(schema.gradeItems.sectionId, section.id),
            eq(schema.gradeItems.periodId, periodId),
            isNotNull(schema.gradeItems.competencyCode),
          ),
        )
        .orderBy(asc(schema.gradeItems.createdAt));

      const itemIds = items.map((item) => item.id);
      const gradeRows =
        itemIds.length > 0
          ? await tx
              .select()
              .from(schema.grades)
              .where(
                and(
                  eq(schema.grades.tenantId, user.tenantId),
                  inArray(schema.grades.itemId, itemIds),
                ),
              )
          : [];

      const enrollments = await tx
        .select({ student: schema.students })
        .from(schema.enrollments)
        .innerJoin(schema.students, eq(schema.students.id, schema.enrollments.studentId))
        .where(
          and(
            eq(schema.enrollments.tenantId, user.tenantId),
            eq(schema.enrollments.sectionId, section.id),
            eq(schema.enrollments.status, 'active'),
          ),
        )
        .orderBy(asc(schema.students.lastName), asc(schema.students.firstName));

      const scoreByItemStudent = new Map<string, number>();
      for (const grade of gradeRows) {
        scoreByItemStudent.set(`${grade.itemId}:${grade.studentId}`, grade.score);
      }

      const competencies = new Map<
        string,
        { code: string; possible: number; items: Array<{ id: string; title: string; maxScore: number }> }
      >();
      for (const item of items) {
        const code = item.competencyCode as string;
        const entry = competencies.get(code) ?? { code, possible: 0, items: [] };
        entry.possible += item.maxScore;
        entry.items.push({ id: item.id, title: item.title, maxScore: item.maxScore });
        competencies.set(code, entry);
      }
      const codeList = [...competencies.values()].sort((a, b) => a.code.localeCompare(b.code));

      const students = enrollments.map(({ student }) => ({
        studentId: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        lrn: student.lrn,
        results: codeList.map((competency) => {
          let earned = 0;
          for (const item of competency.items) {
            earned += scoreByItemStudent.get(`${item.id}:${student.id}`) ?? 0;
          }
          return {
            code: competency.code,
            earned: round2(earned),
            possible: competency.possible,
            percentage:
              competency.possible > 0 ? round2((earned / competency.possible) * 100) : null,
          };
        }),
      }));

      return {
        period: toGradingPeriod(period),
        policy: 'raw-percentage' as const,
        competencies: codeList,
        students,
      };
    });
  }

  async sf9Draft(user: AuthUser, sectionId: string, periodId: string) {
    const gradebook = await this.getGradebook(user, sectionId, periodId);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'LMS';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('SF9 Draft', {
      views: [{ state: 'frozen', ySplit: 6 }],
    });

    const categoryNames = gradebook.categories.map((category) => category.name);
    const lastColumn = 3 + categoryNames.length + 4;

    sheet.mergeCells(1, 1, 1, lastColumn);
    const title = sheet.getCell(1, 1);
    title.value = 'DRAFT — NOT AN OFFICIAL DEPED SF9';
    title.font = { bold: true, size: 14, color: { argb: 'FFB00020' } };
    title.alignment = { horizontal: 'center' };

    sheet.getCell(2, 1).value = `School: ${gradebook.school.name}`;
    sheet.getCell(3, 1).value =
      `School Year: ${gradebook.period.schoolYear}    Section: ${gradebook.section.name}    Grade Level: ${gradebook.section.gradeLevel}`;
    sheet.getCell(4, 1).value =
      `Period: ${gradebook.period.name}    Adviser: ${gradebook.adviserName ?? ''}`;
    sheet.getCell(5, 1).value = `Grading policy: ${gradebook.transmutationPolicy}`;

    const headers = [
      'No.',
      'Learner',
      'LRN',
      ...categoryNames,
      'Initial Grade',
      'Transmuted',
      'Override',
      'Effective',
    ];

    const headerRow = 6;
    headers.forEach((value, index) => {
      const cell = sheet.getCell(headerRow, index + 1);
      cell.value = value;
      cell.font = { bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });

    gradebook.students.forEach((student, index) => {
      const row = headerRow + 1 + index;
      const categoryGrades = gradebook.categories.map((category) => {
        const result = student.categories.find((entry) => entry.categoryId === category.id);
        return result?.percentage ?? '';
      });
      const values: Array<string | number> = [
        index + 1,
        `${student.lastName}, ${student.firstName}`,
        student.lrn ?? '',
        ...categoryGrades,
        student.percentage ?? '',
        student.transmutedGrade ?? '',
        student.override?.grade ?? '',
        student.effectiveGrade ?? '',
      ];
      values.forEach((value, columnIndex) => {
        sheet.getCell(row, columnIndex + 1).value = value;
      });
    });

    const noteRow = headerRow + gradebook.students.length + 2;
    sheet.mergeCells(noteRow, 1, noteRow, lastColumn);
    const note = sheet.getCell(noteRow, 1);
    note.value =
      'Draft for registrar review only. Layout, labels, and learner fields are pending confirmation of the current SF9 form revision.';
    note.font = { italic: true };

    sheet.getColumn(1).width = 6;
    sheet.getColumn(2).width = 30;
    sheet.getColumn(3).width = 16;
    for (let index = 0; index < categoryNames.length; index += 1) {
      sheet.getColumn(4 + index).width = 16;
    }
    for (let index = 0; index < 4; index += 1) {
      sheet.getColumn(4 + categoryNames.length + index).width = 12;
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const safe = (value: string) =>
      value.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'section';

    return {
      buffer: Buffer.from(buffer),
      filename: `SF9-draft_${safe(gradebook.section.name)}_${safe(gradebook.period.name)}.xlsx`,
    };
  }

  private async requirePeriod(
    tx: Database,
    tenantId: string,
    periodId: string,
  ): Promise<GradingPeriodRow> {
    const [period] = await tx
      .select()
      .from(schema.gradingPeriods)
      .where(
        and(
          eq(schema.gradingPeriods.id, periodId),
          eq(schema.gradingPeriods.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (!period) throw new NotFoundException('grading period not found');
    return period;
  }

  private async audit(
    tx: Database,
    user: AuthUser,
    action: string,
    entity: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await tx.insert(schema.auditLog).values({
      tenantId: user.tenantId,
      actorId: user.userId,
      action,
      entity,
      entityId,
      metadata,
    });
  }
}
