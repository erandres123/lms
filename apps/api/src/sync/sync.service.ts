import type {
  SyncAttendanceOp,
  SyncConflict,
  SyncPushInput,
  SyncPushOutcome,
  SyncPushResult,
  SyncPullQuery,
  SyncStats,
} from '@lms/shared';
import { ConflictException, Injectable } from '@nestjs/common';
import { and, count, eq, gt, inArray, sql } from 'drizzle-orm';
import { AcademicService } from '../academic/academic.service';
import { toAttendance, toEnrollment, toSection, toStudent } from '../academic/academic.mappers';
import type { AuthUser } from '../auth/auth.types';
import { DatabaseService, type Database } from '../database/database.service';
import * as schema from '../database/schema';
import {
  toGrade,
  toGradeCategory,
  toGradeItem,
  toGradeOverride,
  toGradingPeriod,
} from '../gradebook/gradebook.mappers';
import { NotificationsService } from '../notifications/notifications.service';

const SYNCED_TABLES = [
  'sections',
  'students',
  'enrollments',
  'attendance',
  'grading_periods',
  'grade_categories',
  'grade_items',
  'grades',
  'grade_overrides',
] as const;
type SyncedTable = (typeof SYNCED_TABLES)[number];

type Visibility = Record<SyncedTable, Set<string> | null>;

function isSyncedTable(value: string): value is SyncedTable {
  return (SYNCED_TABLES as readonly string[]).includes(value);
}

@Injectable()
export class SyncService {
  constructor(
    private readonly database: DatabaseService,
    private readonly academic: AcademicService,
    private readonly notifications: NotificationsService,
  ) {}

  async push(user: AuthUser, input: SyncPushInput): Promise<SyncPushResult> {
    const results: SyncPushOutcome[] = [];
    for (const operation of input.operations) {
      results.push(await this.applyOperation(user, operation));
    }
    return { results };
  }

  private async applyOperation(
    user: AuthUser,
    operation: SyncAttendanceOp,
  ): Promise<SyncPushOutcome> {
    const outcome = await this.database.withTenant(user.tenantId, async (tx) => {
      const [receipt] = await tx
        .insert(schema.syncOperations)
        .values({
          tenantId: user.tenantId,
          userId: user.userId,
          clientOpId: operation.clientOpId,
          kind: operation.kind,
          status: 'pending',
        })
        .onConflictDoNothing()
        .returning();

      if (!receipt) {
        const [existing] = await tx
          .select()
          .from(schema.syncOperations)
          .where(
            and(
              eq(schema.syncOperations.tenantId, user.tenantId),
              eq(schema.syncOperations.userId, user.userId),
              eq(schema.syncOperations.clientOpId, operation.clientOpId),
            ),
          )
          .limit(1);

        if (!existing) throw new Error('sync receipt vanished after conflict');

        return {
          kind: 'duplicate' as const,
          receiptId: existing.id,
          storedStatus: existing.status === 'conflict' ? ('conflict' as const) : ('applied' as const),
          conflict: existing.result as unknown as SyncConflict,
        };
      }

      // The savepoint keeps a partially applied sheet from persisting when one
      // entry loses the baseVersion check; the receipt still records the conflict.
      await tx.execute(sql`savepoint sync_operation`);
      try {
        const saved = await this.academic.saveAttendanceInTx(tx, user, operation.sectionId, {
          date: operation.date,
          entries: operation.entries,
        });
        await tx.execute(sql`release savepoint sync_operation`);

        await tx
          .update(schema.syncOperations)
          .set({ status: 'applied' })
          .where(eq(schema.syncOperations.id, receipt.id));

        return { kind: 'applied' as const, receiptId: receipt.id, saved };
      } catch (error: unknown) {
        await tx.execute(sql`rollback to savepoint sync_operation`);

        if (!(error instanceof ConflictException)) throw error;

        const response = error.getResponse();
        const conflict: SyncConflict =
          typeof response === 'string' ? { message: response } : (response as SyncConflict);

        await tx
          .update(schema.syncOperations)
          .set({ status: 'conflict', result: conflict as unknown as Record<string, unknown> })
          .where(eq(schema.syncOperations.id, receipt.id));

        return { kind: 'conflict' as const, receiptId: receipt.id, conflict };
      }
    });

    if (outcome.kind === 'applied') {
      await this.notifications.dispatch(outcome.saved.notificationIds);
      return { clientOpId: operation.clientOpId, status: 'applied' };
    }

    if (outcome.kind === 'conflict') {
      return { clientOpId: operation.clientOpId, status: 'conflict', conflict: outcome.conflict };
    }

    return {
      clientOpId: operation.clientOpId,
      status: 'duplicate',
      storedStatus: outcome.storedStatus,
      ...(outcome.storedStatus === 'conflict' && outcome.conflict
        ? { conflict: outcome.conflict }
        : {}),
    };
  }

  async stats(user: AuthUser): Promise<SyncStats> {
    return this.database.withTenant(user.tenantId, async (tx) => {
      const rows = await tx
        .select({ status: schema.syncOperations.status, total: count() })
        .from(schema.syncOperations)
        .where(eq(schema.syncOperations.tenantId, user.tenantId))
        .groupBy(schema.syncOperations.status);

      const byStatus = new Map(rows.map((row) => [row.status, Number(row.total)]));
      const applied = byStatus.get('applied') ?? 0;
      const conflicts = byStatus.get('conflict') ?? 0;

      return { applied, conflicts, total: applied + conflicts };
    });
  }

  pull(user: AuthUser, query: SyncPullQuery) {
    const { cursor, limit } = query;

    return this.database.withTenant(user.tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(schema.changeLog)
        .where(
          and(eq(schema.changeLog.tenantId, user.tenantId), gt(schema.changeLog.seq, cursor)),
        )
        .orderBy(schema.changeLog.seq)
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = page.length > 0 ? page[page.length - 1]!.seq : cursor;

      const visibility = await this.visibilityFor(tx, user);
      const visible = page.filter((row) => {
        if (!isSyncedTable(row.tableName)) return false;
        // Deleted rows are gone from the visibility query, so their tombstones
        // are forwarded tenant-wide; the row id is the only data they carry.
        if (row.operation === 'delete') return true;
        const allowed = visibility[row.tableName];
        return allowed === null || allowed.has(row.rowId);
      });

      const idsByTable = new Map<SyncedTable, string[]>();
      for (const row of visible) {
        if (!isSyncedTable(row.tableName)) continue;
        const ids = idsByTable.get(row.tableName) ?? [];
        ids.push(row.rowId);
        idsByTable.set(row.tableName, ids);
      }

      const dataByTable = new Map<SyncedTable, Map<string, unknown>>();
      for (const [table, ids] of idsByTable) {
        dataByTable.set(table, await this.loadRows(tx, user.tenantId, table, ids));
      }

      const changes = visible.flatMap((row) => {
        if (!isSyncedTable(row.tableName)) return [];
        return [
          {
            seq: row.seq,
            table: row.tableName,
            operation: row.operation,
            rowId: row.rowId,
            version: row.rowVersion,
            changedAt: row.changedAt.toISOString(),
            data: dataByTable.get(row.tableName)?.get(row.rowId) ?? null,
          },
        ];
      });

      return { changes, nextCursor, hasMore };
    });
  }

  private async visibilityFor(tx: Database, user: AuthUser): Promise<Visibility> {
    const sectionsSet = new Set<string>();
    const studentsSet = new Set<string>();
    const enrollmentsSet = new Set<string>();
    const attendanceSet = new Set<string>();
    const categoriesSet = new Set<string>();
    const itemsSet = new Set<string>();
    const gradesSet = new Set<string>();
    const overridesSet = new Set<string>();

    const tenantWide = {
      grading_periods: null,
    };

    if (user.role === 'school_admin') {
      return {
        sections: null,
        students: null,
        enrollments: null,
        attendance: null,
        grade_categories: null,
        grade_items: null,
        grades: null,
        grade_overrides: null,
        ...tenantWide,
      };
    }

    if (user.role === 'teacher') {
      const owned = await tx
        .select({ id: schema.sections.id })
        .from(schema.sections)
        .where(
          and(
            eq(schema.sections.tenantId, user.tenantId),
            eq(schema.sections.teacherId, user.userId),
          ),
        );

      const sectionIds = owned.map((section) => section.id);
      for (const sectionId of sectionIds) sectionsSet.add(sectionId);

      if (sectionIds.length > 0) {
        const enrollmentRows = await tx
          .select({ id: schema.enrollments.id, studentId: schema.enrollments.studentId })
          .from(schema.enrollments)
          .where(
            and(
              eq(schema.enrollments.tenantId, user.tenantId),
              inArray(schema.enrollments.sectionId, sectionIds),
            ),
          );

        for (const enrollment of enrollmentRows) {
          enrollmentsSet.add(enrollment.id);
          studentsSet.add(enrollment.studentId);
        }

        const attendanceRows = await tx
          .select({ id: schema.attendance.id })
          .from(schema.attendance)
          .where(
            and(
              eq(schema.attendance.tenantId, user.tenantId),
              inArray(schema.attendance.sectionId, sectionIds),
            ),
          );

        for (const record of attendanceRows) attendanceSet.add(record.id);

        const categoryRows = await tx
          .select({ id: schema.gradeCategories.id })
          .from(schema.gradeCategories)
          .where(
            and(
              eq(schema.gradeCategories.tenantId, user.tenantId),
              inArray(schema.gradeCategories.sectionId, sectionIds),
            ),
          );

        for (const category of categoryRows) categoriesSet.add(category.id);

        const itemRows = await tx
          .select({ id: schema.gradeItems.id })
          .from(schema.gradeItems)
          .where(
            and(
              eq(schema.gradeItems.tenantId, user.tenantId),
              inArray(schema.gradeItems.sectionId, sectionIds),
            ),
          );

        const itemIds = itemRows.map((item) => item.id);
        for (const itemId of itemIds) itemsSet.add(itemId);

        if (itemIds.length > 0) {
          const gradeRows = await tx
            .select({ id: schema.grades.id })
            .from(schema.grades)
            .where(
              and(eq(schema.grades.tenantId, user.tenantId), inArray(schema.grades.itemId, itemIds)),
            );

          for (const grade of gradeRows) gradesSet.add(grade.id);
        }

        const overrideRows = await tx
          .select({ id: schema.gradeOverrides.id })
          .from(schema.gradeOverrides)
          .where(
            and(
              eq(schema.gradeOverrides.tenantId, user.tenantId),
              inArray(schema.gradeOverrides.sectionId, sectionIds),
            ),
          );

        for (const override of overrideRows) overridesSet.add(override.id);
      }
    }

    if (user.role === 'student') {
      const [own] = await tx
        .select({ id: schema.students.id })
        .from(schema.students)
        .where(
          and(eq(schema.students.tenantId, user.tenantId), eq(schema.students.userId, user.userId)),
        )
        .limit(1);

      if (own) {
        studentsSet.add(own.id);

        const enrollmentRows = await tx
          .select({ id: schema.enrollments.id, sectionId: schema.enrollments.sectionId })
          .from(schema.enrollments)
          .where(
            and(
              eq(schema.enrollments.tenantId, user.tenantId),
              eq(schema.enrollments.studentId, own.id),
            ),
          );

        const sectionIds = new Set<string>();
        for (const enrollment of enrollmentRows) {
          enrollmentsSet.add(enrollment.id);
          sectionsSet.add(enrollment.sectionId);
          sectionIds.add(enrollment.sectionId);
        }

        const attendanceRows = await tx
          .select({ id: schema.attendance.id })
          .from(schema.attendance)
          .where(
            and(
              eq(schema.attendance.tenantId, user.tenantId),
              eq(schema.attendance.studentId, own.id),
            ),
          );

        for (const record of attendanceRows) attendanceSet.add(record.id);

        if (sectionIds.size > 0) {
          const sectionIdList = [...sectionIds];

          const categoryRows = await tx
            .select({ id: schema.gradeCategories.id })
            .from(schema.gradeCategories)
            .where(
              and(
                eq(schema.gradeCategories.tenantId, user.tenantId),
                inArray(schema.gradeCategories.sectionId, sectionIdList),
              ),
            );

          for (const category of categoryRows) categoriesSet.add(category.id);

          const itemRows = await tx
            .select({ id: schema.gradeItems.id })
            .from(schema.gradeItems)
            .where(
              and(
                eq(schema.gradeItems.tenantId, user.tenantId),
                inArray(schema.gradeItems.sectionId, sectionIdList),
              ),
            );

          for (const item of itemRows) itemsSet.add(item.id);
        }

        const gradeRows = await tx
          .select({ id: schema.grades.id })
          .from(schema.grades)
          .where(
            and(eq(schema.grades.tenantId, user.tenantId), eq(schema.grades.studentId, own.id)),
          );

        for (const grade of gradeRows) gradesSet.add(grade.id);

        const overrideRows = await tx
          .select({ id: schema.gradeOverrides.id })
          .from(schema.gradeOverrides)
          .where(
            and(
              eq(schema.gradeOverrides.tenantId, user.tenantId),
              eq(schema.gradeOverrides.studentId, own.id),
            ),
          );

        for (const override of overrideRows) overridesSet.add(override.id);
      }
    }

    return {
      sections: sectionsSet,
      students: studentsSet,
      enrollments: enrollmentsSet,
      attendance: attendanceSet,
      grade_categories: categoriesSet,
      grade_items: itemsSet,
      grades: gradesSet,
      grade_overrides: overridesSet,
      ...tenantWide,
    };
  }

  private async loadRows(
    tx: Database,
    tenantId: string,
    table: SyncedTable,
    ids: string[],
  ): Promise<Map<string, unknown>> {
    switch (table) {
      case 'sections': {
        const rows = await tx
          .select()
          .from(schema.sections)
          .where(and(eq(schema.sections.tenantId, tenantId), inArray(schema.sections.id, ids)));
        return new Map(rows.map((row) => [row.id, toSection(row)]));
      }
      case 'students': {
        const rows = await tx
          .select()
          .from(schema.students)
          .where(and(eq(schema.students.tenantId, tenantId), inArray(schema.students.id, ids)));
        return new Map(rows.map((row) => [row.id, toStudent(row)]));
      }
      case 'enrollments': {
        const rows = await tx
          .select()
          .from(schema.enrollments)
          .where(
            and(eq(schema.enrollments.tenantId, tenantId), inArray(schema.enrollments.id, ids)),
          );
        return new Map(rows.map((row) => [row.id, toEnrollment(row)]));
      }
      case 'attendance': {
        const rows = await tx
          .select()
          .from(schema.attendance)
          .where(
            and(eq(schema.attendance.tenantId, tenantId), inArray(schema.attendance.id, ids)),
          );
        return new Map(rows.map((row) => [row.id, toAttendance(row)]));
      }
      case 'grading_periods': {
        const rows = await tx
          .select()
          .from(schema.gradingPeriods)
          .where(
            and(
              eq(schema.gradingPeriods.tenantId, tenantId),
              inArray(schema.gradingPeriods.id, ids),
            ),
          );
        return new Map(rows.map((row) => [row.id, toGradingPeriod(row)]));
      }
      case 'grade_categories': {
        const rows = await tx
          .select()
          .from(schema.gradeCategories)
          .where(
            and(
              eq(schema.gradeCategories.tenantId, tenantId),
              inArray(schema.gradeCategories.id, ids),
            ),
          );
        return new Map(rows.map((row) => [row.id, toGradeCategory(row)]));
      }
      case 'grade_items': {
        const rows = await tx
          .select()
          .from(schema.gradeItems)
          .where(
            and(eq(schema.gradeItems.tenantId, tenantId), inArray(schema.gradeItems.id, ids)),
          );
        return new Map(rows.map((row) => [row.id, toGradeItem(row)]));
      }
      case 'grades': {
        const rows = await tx
          .select()
          .from(schema.grades)
          .where(and(eq(schema.grades.tenantId, tenantId), inArray(schema.grades.id, ids)));
        return new Map(rows.map((row) => [row.id, toGrade(row)]));
      }
      case 'grade_overrides': {
        const rows = await tx
          .select()
          .from(schema.gradeOverrides)
          .where(
            and(
              eq(schema.gradeOverrides.tenantId, tenantId),
              inArray(schema.gradeOverrides.id, ids),
            ),
          );
        return new Map(rows.map((row) => [row.id, toGradeOverride(row)]));
      }
    }
  }
}
