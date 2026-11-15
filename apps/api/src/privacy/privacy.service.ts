import type { DsarExport, ErasureCategory, ErasurePlan } from '@lms/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq, type SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { AuthUser } from '../auth/auth.types';
import { DatabaseService, type Database } from '../database/database.service';
import * as schema from '../database/schema';

const iso = (value: Date | null) => value?.toISOString() ?? null;

@Injectable()
export class PrivacyService {
  constructor(private readonly database: DatabaseService) {}

  dsarExport(user: AuthUser, studentId: string): Promise<DsarExport> {
    return this.database.withTenant(user.tenantId, async (tx) => {
      const student = await this.loadStudent(tx, user, studentId);
      const userId = student.userId;

      const [tenant] = await tx
        .select({ id: schema.tenants.id, name: schema.tenants.name, timezone: schema.tenants.timezone })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, user.tenantId))
        .limit(1);
      if (!tenant) throw new NotFoundException('student not found');

      const [account] = userId
        ? await tx
            .select({
              userId: schema.users.id,
              email: schema.users.email,
              displayName: schema.users.displayName,
            })
            .from(schema.users)
            .where(eq(schema.users.id, userId))
            .limit(1)
        : [];

      const enrollments = await tx
        .select({
          sectionId: schema.sections.id,
          sectionName: schema.sections.name,
          gradeLevel: schema.sections.gradeLevel,
          schoolYear: schema.sections.schoolYear,
          status: schema.enrollments.status,
          enrolledAt: schema.enrollments.enrolledAt,
        })
        .from(schema.enrollments)
        .innerJoin(schema.sections, eq(schema.enrollments.sectionId, schema.sections.id))
        .where(
          and(
            eq(schema.enrollments.tenantId, user.tenantId),
            eq(schema.enrollments.studentId, studentId),
          ),
        )
        .orderBy(desc(schema.enrollments.enrolledAt));

      const attendance = await tx
        .select({
          date: schema.attendance.date,
          sectionId: schema.sections.id,
          sectionName: schema.sections.name,
          status: schema.attendance.status,
          note: schema.attendance.note,
          recordedAt: schema.attendance.recordedAt,
        })
        .from(schema.attendance)
        .innerJoin(schema.sections, eq(schema.attendance.sectionId, schema.sections.id))
        .where(
          and(
            eq(schema.attendance.tenantId, user.tenantId),
            eq(schema.attendance.studentId, studentId),
          ),
        )
        .orderBy(desc(schema.attendance.date));

      const grades = await tx
        .select({
          itemId: schema.gradeItems.id,
          itemTitle: schema.gradeItems.title,
          maxScore: schema.gradeItems.maxScore,
          categoryName: schema.gradeCategories.name,
          periodName: schema.gradingPeriods.name,
          sectionId: schema.sections.id,
          sectionName: schema.sections.name,
          score: schema.grades.score,
          recordedAt: schema.grades.recordedAt,
        })
        .from(schema.grades)
        .innerJoin(schema.gradeItems, eq(schema.grades.itemId, schema.gradeItems.id))
        .innerJoin(schema.gradeCategories, eq(schema.gradeItems.categoryId, schema.gradeCategories.id))
        .innerJoin(schema.gradingPeriods, eq(schema.gradeItems.periodId, schema.gradingPeriods.id))
        .innerJoin(schema.sections, eq(schema.gradeItems.sectionId, schema.sections.id))
        .where(
          and(eq(schema.grades.tenantId, user.tenantId), eq(schema.grades.studentId, studentId)),
        )
        .orderBy(desc(schema.grades.recordedAt));

      const overrides = await tx
        .select({
          sectionId: schema.sections.id,
          sectionName: schema.sections.name,
          periodName: schema.gradingPeriods.name,
          grade: schema.gradeOverrides.grade,
          reason: schema.gradeOverrides.reason,
          createdAt: schema.gradeOverrides.createdAt,
        })
        .from(schema.gradeOverrides)
        .innerJoin(schema.sections, eq(schema.gradeOverrides.sectionId, schema.sections.id))
        .innerJoin(schema.gradingPeriods, eq(schema.gradeOverrides.periodId, schema.gradingPeriods.id))
        .where(
          and(
            eq(schema.gradeOverrides.tenantId, user.tenantId),
            eq(schema.gradeOverrides.studentId, studentId),
          ),
        )
        .orderBy(desc(schema.gradeOverrides.createdAt));

      const notifications = userId
        ? await tx
            .select({
              kind: schema.notifications.kind,
              title: schema.notifications.title,
              body: schema.notifications.body,
              createdAt: schema.notifications.createdAt,
              readAt: schema.notifications.readAt,
            })
            .from(schema.notifications)
            .where(
              and(
                eq(schema.notifications.tenantId, user.tenantId),
                eq(schema.notifications.userId, userId),
              ),
            )
            .orderBy(desc(schema.notifications.createdAt))
        : [];

      const devices = userId
        ? await tx
            .select({
              platform: schema.pushDevices.platform,
              createdAt: schema.pushDevices.createdAt,
              lastSeenAt: schema.pushDevices.lastSeenAt,
            })
            .from(schema.pushDevices)
            .where(
              and(
                eq(schema.pushDevices.tenantId, user.tenantId),
                eq(schema.pushDevices.userId, userId),
              ),
            )
        : [];

      const participation = await tx
        .select({
          meetingId: schema.meetings.id,
          meetingTitle: schema.meetings.title,
          sectionName: schema.sections.name,
          role: schema.meetingParticipants.role,
          firstJoinedAt: schema.meetingParticipants.firstJoinedAt,
          lastLeftAt: schema.meetingParticipants.lastLeftAt,
          totalSeconds: schema.meetingParticipants.totalSeconds,
        })
        .from(schema.meetingParticipants)
        .innerJoin(schema.meetings, eq(schema.meetingParticipants.meetingId, schema.meetings.id))
        .innerJoin(schema.sections, eq(schema.meetings.sectionId, schema.sections.id))
        .where(
          and(
            eq(schema.meetingParticipants.tenantId, user.tenantId),
            eq(schema.meetingParticipants.studentId, studentId),
          ),
        )
        .orderBy(desc(schema.meetingParticipants.firstJoinedAt));

      const exported: DsarExport = {
        generatedAt: new Date().toISOString(),
        tenant,
        student: {
          id: student.id,
          userId: student.userId,
          firstName: student.firstName,
          lastName: student.lastName,
          lrn: student.lrn,
          createdAt: student.createdAt.toISOString(),
          updatedAt: student.updatedAt.toISOString(),
        },
        account: account ?? null,
        enrollments: enrollments.map((row) => ({
          ...row,
          enrolledAt: row.enrolledAt.toISOString(),
        })),
        attendance: attendance.map((row) => ({
          ...row,
          recordedAt: row.recordedAt.toISOString(),
        })),
        grades: grades.map((row) => ({ ...row, recordedAt: row.recordedAt.toISOString() })),
        gradeOverrides: overrides.map((row) => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
        })),
        notifications: notifications.map((row) => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
          readAt: iso(row.readAt),
        })),
        pushDevices: devices.map((row) => ({
          platform: row.platform,
          createdAt: row.createdAt.toISOString(),
          lastSeenAt: row.lastSeenAt.toISOString(),
        })),
        meetingParticipation: participation.map((row) => ({
          ...row,
          firstJoinedAt: row.firstJoinedAt.toISOString(),
          lastLeftAt: iso(row.lastLeftAt),
        })),
      };

      await tx.insert(schema.auditLog).values({
        tenantId: user.tenantId,
        actorId: user.userId,
        action: 'privacy.dsar_exported',
        entity: 'student',
        entityId: studentId,
        metadata: {
          enrollments: exported.enrollments.length,
          attendance: exported.attendance.length,
          grades: exported.grades.length,
          notifications: exported.notifications.length,
        },
      });

      return exported;
    });
  }

  erasureDryRun(user: AuthUser, studentId: string): Promise<ErasurePlan> {
    return this.database.withTenant(user.tenantId, async (tx) => {
      const student = await this.loadStudent(tx, user, studentId);
      const userId = student.userId;

      const total = async (table: PgTable, where: SQL | undefined) => {
        const [row] = await tx.select({ total: count() }).from(table).where(where);
        return Number(row?.total ?? 0);
      };

      // Counts run sequentially: one pg client cannot execute overlapping queries.
      const enrollments = await total(
        schema.enrollments,
        and(
          eq(schema.enrollments.tenantId, user.tenantId),
          eq(schema.enrollments.studentId, studentId),
        ),
      );
      const attendance = await total(
        schema.attendance,
        and(
          eq(schema.attendance.tenantId, user.tenantId),
          eq(schema.attendance.studentId, studentId),
        ),
      );
      const grades = await total(
        schema.grades,
        and(eq(schema.grades.tenantId, user.tenantId), eq(schema.grades.studentId, studentId)),
      );
      const overrides = await total(
        schema.gradeOverrides,
        and(
          eq(schema.gradeOverrides.tenantId, user.tenantId),
          eq(schema.gradeOverrides.studentId, studentId),
        ),
      );
      const notifications = userId
        ? await total(
            schema.notifications,
            and(
              eq(schema.notifications.tenantId, user.tenantId),
              eq(schema.notifications.userId, userId),
            ),
          )
        : 0;
      const devices = userId
        ? await total(
            schema.pushDevices,
            and(
              eq(schema.pushDevices.tenantId, user.tenantId),
              eq(schema.pushDevices.userId, userId),
            ),
          )
        : 0;
      const participation = await total(
        schema.meetingParticipants,
        and(
          eq(schema.meetingParticipants.tenantId, user.tenantId),
          eq(schema.meetingParticipants.studentId, studentId),
        ),
      );

      const categories: ErasureCategory[] = [
        {
          table: 'students',
          label: 'Student identity (name, LRN)',
          rows: 1,
          action: 'anonymize',
          reason: 'Replace identifying fields; the row stays as the anchor for academic records.',
        },
        {
          table: 'users',
          label: 'Sign-in account (email, display name)',
          rows: userId ? 1 : 0,
          action: userId ? 'anonymize' : 'retain',
          reason: userId
            ? 'Replace email and display name; the Supabase Auth identity must also be removed.'
            : 'No account is linked to this student.',
        },
        {
          table: 'enrollments',
          label: 'Enrollments',
          rows: enrollments,
          action: 'retain',
          reason: 'Academic record; retained under the school retention schedule.',
        },
        {
          table: 'attendance',
          label: 'Attendance records',
          rows: attendance,
          action: 'retain',
          reason: 'Academic record; retained under the school retention schedule.',
        },
        {
          table: 'grades',
          label: 'Grade entries',
          rows: grades,
          action: 'retain',
          reason: 'Academic record; retained under the school retention schedule.',
        },
        {
          table: 'grade_overrides',
          label: 'Grade overrides',
          rows: overrides,
          action: 'retain',
          reason: 'Academic record with staff justification; retained.',
        },
        {
          table: 'notifications',
          label: 'Inbox messages',
          rows: notifications,
          action: 'delete',
          reason: 'Delivery messages; no academic value after the fact.',
        },
        {
          table: 'push_devices',
          label: 'Registered push devices',
          rows: devices,
          action: 'delete',
          reason: 'Device tokens are personal and only used for delivery.',
        },
        {
          table: 'meeting_participants',
          label: 'Live class participation',
          rows: participation,
          action: 'anonymize',
          reason: 'Clear display name; keep duration for class records.',
        },
        {
          table: 'audit_log',
          label: 'Audit trail',
          rows: 0,
          action: 'retain',
          reason: 'Append-only accountability log; not counted by student here.',
        },
      ];

      const plan: ErasurePlan = {
        dryRun: true,
        studentId,
        generatedAt: new Date().toISOString(),
        categories,
        warnings: [
          'Dry run only. No rows were changed.',
          "Academic records (enrollment, attendance, grades) are retained. Confirm the school's retention schedule before a real erasure.",
          'Supabase Auth account deletion is outside this API; a real erasure must also remove or disable that identity.',
          'Audit entries are append-only and retained for accountability.',
        ],
      };

      await tx.insert(schema.auditLog).values({
        tenantId: user.tenantId,
        actorId: user.userId,
        action: 'privacy.erasure_dry_run',
        entity: 'student',
        entityId: studentId,
        metadata: { categories: categories.length, rows: categories.reduce((sum, c) => sum + c.rows, 0) },
      });

      return plan;
    });
  }

  private async loadStudent(tx: Database, user: AuthUser, studentId: string) {
    const [student] = await tx
      .select()
      .from(schema.students)
      .where(and(eq(schema.students.tenantId, user.tenantId), eq(schema.students.id, studentId)))
      .limit(1);

    if (!student) throw new NotFoundException('student not found');
    return student;
  }
}
