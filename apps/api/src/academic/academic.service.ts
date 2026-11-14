import type { CreateSectionInput, CreateStudentInput, SaveAttendanceInput } from '@lms/shared';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { AuthUser } from '../auth/auth.types';
import { DatabaseService, type Database } from '../database/database.service';
import * as schema from '../database/schema';
import {
  absenceMarkedNotification,
  dedupeKeys,
} from '../notifications/notification-copy';
import { NotificationsService } from '../notifications/notifications.service';
import { toAttendance, toSection, toStudent } from './academic.mappers';
import { parseRosterFile } from './roster-import';
import { SectionAccessService } from './section-access.service';

@Injectable()
export class AcademicService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: SectionAccessService,
    private readonly notifications: NotificationsService,
  ) {}

  listSections(user: AuthUser) {
    return this.database.withTenant(user.tenantId, async (tx) => {
      if (user.role === 'teacher') {
        const rows = await tx
          .select()
          .from(schema.sections)
          .where(
            and(
              eq(schema.sections.tenantId, user.tenantId),
              eq(schema.sections.teacherId, user.userId),
            ),
          )
          .orderBy(schema.sections.createdAt);
        return rows.map(toSection);
      }

      if (user.role === 'student') {
        const rows = await tx
          .select({ section: schema.sections })
          .from(schema.sections)
          .innerJoin(schema.enrollments, eq(schema.enrollments.sectionId, schema.sections.id))
          .innerJoin(schema.students, eq(schema.students.id, schema.enrollments.studentId))
          .where(
            and(
              eq(schema.sections.tenantId, user.tenantId),
              eq(schema.students.userId, user.userId),
              eq(schema.enrollments.status, 'active'),
            ),
          )
          .orderBy(schema.sections.createdAt);
        return rows.map((row) => toSection(row.section));
      }

      const rows = await tx
        .select()
        .from(schema.sections)
        .where(eq(schema.sections.tenantId, user.tenantId))
        .orderBy(schema.sections.createdAt);
      return rows.map(toSection);
    });
  }

  createSection(user: AuthUser, input: CreateSectionInput) {
    return this.database.withTenant(user.tenantId, async (tx) => {
      if (input.teacherId) {
        await this.requireTeacherMembership(tx, user, input.teacherId);
      }

      const [row] = await tx
        .insert(schema.sections)
        .values({
          tenantId: user.tenantId,
          name: input.name,
          gradeLevel: input.gradeLevel,
          schoolYear: input.schoolYear,
          teacherId: input.teacherId ?? null,
        })
        .returning();

      if (!row) throw new Error('failed to create section');
      await this.audit(tx, user, 'section.created', 'section', row.id, {
        name: row.name,
        schoolYear: row.schoolYear,
      });
      return toSection(row);
    });
  }

  listStudents(user: AuthUser) {
    return this.database.withTenant(user.tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(schema.students)
        .where(eq(schema.students.tenantId, user.tenantId))
        .orderBy(schema.students.lastName, schema.students.firstName);
      return rows.map(toStudent);
    });
  }

  createStudent(user: AuthUser, input: CreateStudentInput) {
    return this.database.withTenant(user.tenantId, async (tx) => {
      if (input.userId) {
        await this.requireStudentMembership(tx, user, input.userId);
      }

      const [row] = await tx
        .insert(schema.students)
        .values({
          tenantId: user.tenantId,
          userId: input.userId ?? null,
          firstName: input.firstName,
          lastName: input.lastName,
          lrn: input.lrn ?? null,
        })
        .returning();

      if (!row) throw new Error('failed to create student');
      await this.audit(tx, user, 'student.created', 'student', row.id, {
        lastName: row.lastName,
        firstName: row.firstName,
      });
      return toStudent(row);
    });
  }

  enrollStudents(user: AuthUser, sectionId: string, studentIds: string[]) {
    return this.database.withTenant(user.tenantId, async (tx) => {
      const section = await this.access.requireSection(tx, user.tenantId, sectionId);

      const uniqueIds = [...new Set(studentIds)];
      const found = await tx
        .select({ id: schema.students.id })
        .from(schema.students)
        .where(
          and(
            eq(schema.students.tenantId, user.tenantId),
            inArray(schema.students.id, uniqueIds),
          ),
        );

      if (found.length !== uniqueIds.length) {
        throw new BadRequestException('one or more students do not belong to this tenant');
      }

      const inserted = await tx
        .insert(schema.enrollments)
        .values(
          uniqueIds.map((studentId) => ({
            tenantId: user.tenantId,
            sectionId: section.id,
            studentId,
          })),
        )
        .onConflictDoNothing({
          target: [schema.enrollments.sectionId, schema.enrollments.studentId],
        })
        .returning({ id: schema.enrollments.id });

      await this.audit(tx, user, 'enrollment.created', 'section', section.id, {
        requested: uniqueIds.length,
        enrolled: inserted.length,
      });

      return { requested: uniqueIds.length, enrolled: inserted.length };
    });
  }

  async importRoster(
    user: AuthUser,
    sectionId: string,
    file: { buffer: Buffer; originalname: string },
  ) {
    const parsed = await parseRosterFile(file.buffer, file.originalname);

    if (!parsed.ok) {
      throw new BadRequestException(parsed.error ?? 'the roster file is invalid');
    }
    if (parsed.rows.length > 500) {
      throw new BadRequestException('a single import can contain at most 500 learners');
    }
    if (parsed.errors.length > 0) {
      return {
        ok: false,
        errors: parsed.errors,
        summary: null,
        results: [],
      };
    }

    return this.database.withTenant(user.tenantId, async (tx) => {
      const section = await this.access.requireSection(tx, user.tenantId, sectionId);

      const summary = {
        rows: parsed.rows.length,
        created: 0,
        updated: 0,
        unchanged: 0,
        enrolled: 0,
        alreadyEnrolled: 0,
      };
      const results: Array<{
        rowNumber: number;
        firstName: string;
        lastName: string;
        lrn: string | null;
        studentId: string;
        status: 'created' | 'updated' | 'unchanged';
        enrolled: boolean;
      }> = [];

      for (const row of parsed.rows) {
        const [existing] = await tx
          .select()
          .from(schema.students)
          .where(
            and(
              eq(schema.students.tenantId, user.tenantId),
              row.lrn
                ? eq(schema.students.lrn, row.lrn)
                : and(
                    eq(schema.students.lastName, row.lastName),
                    eq(schema.students.firstName, row.firstName),
                  ),
            ),
          )
          .limit(1);

        let studentId: string;
        let status: 'created' | 'updated' | 'unchanged';

        if (!existing) {
          const inserted = await tx
            .insert(schema.students)
            .values({
              tenantId: user.tenantId,
              firstName: row.firstName,
              lastName: row.lastName,
              lrn: row.lrn,
            })
            .returning({ id: schema.students.id });

          const insertedStudent = inserted[0];
          if (!insertedStudent) {
            throw new ConflictException('could not create the learner');
          }

          studentId = insertedStudent.id;
          status = 'created';
          summary.created += 1;
        } else {
          studentId = existing.id;
          if (
            existing.firstName !== row.firstName ||
            existing.lastName !== row.lastName ||
            (row.lrn !== null && existing.lrn !== row.lrn)
          ) {
            await tx
              .update(schema.students)
              .set({ firstName: row.firstName, lastName: row.lastName, lrn: row.lrn ?? existing.lrn })
              .where(
                and(
                  eq(schema.students.tenantId, user.tenantId),
                  eq(schema.students.id, existing.id),
                ),
              );
            status = 'updated';
            summary.updated += 1;
          } else {
            status = 'unchanged';
            summary.unchanged += 1;
          }
        }

        const enrolled = await tx
          .insert(schema.enrollments)
          .values({
            tenantId: user.tenantId,
            sectionId: section.id,
            studentId,
          })
          .onConflictDoNothing({
            target: [schema.enrollments.sectionId, schema.enrollments.studentId],
          })
          .returning({ id: schema.enrollments.id });

        if (enrolled.length > 0) summary.enrolled += 1;
        else summary.alreadyEnrolled += 1;

        results.push({
          rowNumber: row.rowNumber,
          firstName: row.firstName,
          lastName: row.lastName,
          lrn: row.lrn,
          studentId,
          status,
          enrolled: enrolled.length > 0,
        });
      }

      await this.audit(tx, user, 'roster.imported', 'section', section.id, summary);

      return { ok: true, errors: [], summary, results };
    });
  }

  getRoster(user: AuthUser, sectionId: string) {
    return this.database.withTenant(user.tenantId, async (tx) => {
      const section = await this.access.requireSection(tx, user.tenantId, sectionId);
      await this.access.requireReadAccess(tx, user, section);

      const rows = await tx
        .select({ enrollment: schema.enrollments, student: schema.students })
        .from(schema.enrollments)
        .innerJoin(schema.students, eq(schema.students.id, schema.enrollments.studentId))
        .where(
          and(
            eq(schema.enrollments.tenantId, user.tenantId),
            eq(schema.enrollments.sectionId, section.id),
          ),
        )
        .orderBy(schema.students.lastName, schema.students.firstName);

      return {
        section: toSection(section),
        students: rows.map((row) => ({
          enrollmentId: row.enrollment.id,
          enrollmentStatus: row.enrollment.status,
          ...toStudent(row.student),
        })),
      };
    });
  }

  getAttendance(user: AuthUser, sectionId: string, date: string) {
    return this.database.withTenant(user.tenantId, async (tx) => {
      const section = await this.access.requireSection(tx, user.tenantId, sectionId);
      await this.access.requireReadAccess(tx, user, section);

      const rows = await tx
        .select()
        .from(schema.attendance)
        .where(
          and(
            eq(schema.attendance.tenantId, user.tenantId),
            eq(schema.attendance.sectionId, section.id),
            eq(schema.attendance.date, date),
          ),
        )
        .orderBy(schema.attendance.studentId);

      return { date, records: rows.map(toAttendance) };
    });
  }

  async saveAttendance(user: AuthUser, sectionId: string, input: SaveAttendanceInput) {
    const result = await this.database.withTenant(user.tenantId, (tx) =>
      this.saveAttendanceInTx(tx, user, sectionId, input),
    );

    await this.notifications.dispatch(result.notificationIds);
    return { date: result.date, records: result.records };
  }

  /** Shared by the online save and the offline sync push so both stay identical. */
  async saveAttendanceInTx(
    tx: Database,
    user: AuthUser,
    sectionId: string,
    input: SaveAttendanceInput,
  ) {
    const section = await this.access.requireSection(tx, user.tenantId, sectionId);
    this.access.requireWriteAccess(user, section);

    await this.assertNotFuture(tx, user, input.date);

    const ids = input.entries.map((entry) => entry.studentId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('duplicate studentId in attendance entries');
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
        insert into ${schema.attendance}
          (tenant_id, section_id, student_id, date, status, note, recorded_by)
        values
          (${user.tenantId}, ${section.id}, ${entry.studentId}, ${input.date},
           ${entry.status}, ${entry.note ?? null}, ${user.userId})
        on conflict (section_id, student_id, date) do update
          set status = excluded.status,
              note = excluded.note,
              recorded_by = excluded.recorded_by,
              recorded_at = now(),
              version = attendance.version + 1
          where attendance.tenant_id = ${user.tenantId}
            and (${baseVersion}::int is null or attendance.version = ${baseVersion})
        returning id
      `);

      if ((result.rowCount ?? 0) === 0) {
        const [current] = await tx
          .select()
          .from(schema.attendance)
          .where(
            and(
              eq(schema.attendance.tenantId, user.tenantId),
              eq(schema.attendance.sectionId, section.id),
              eq(schema.attendance.studentId, entry.studentId),
              eq(schema.attendance.date, input.date),
            ),
          )
          .limit(1);

        throw new ConflictException({
          message: 'attendance changed on the server; refresh and retry',
          studentId: entry.studentId,
          current: current ? toAttendance(current) : null,
        });
      }
    }

    await this.audit(tx, user, 'attendance.saved', 'section', section.id, {
      date: input.date,
      entries: input.entries.length,
    });

    const absentEntries = input.entries.filter((entry) => entry.status === 'absent');
    const notificationIds: string[] = [];

    if (absentEntries.length > 0) {
      const studentRows = await tx
        .select({ id: schema.students.id, userId: schema.students.userId })
        .from(schema.students)
        .where(
          and(
            eq(schema.students.tenantId, user.tenantId),
            inArray(
              schema.students.id,
              absentEntries.map((entry) => entry.studentId),
            ),
          ),
        );

      const userIdByStudent = new Map<string, string>();
      for (const row of studentRows) {
        if (row.userId) userIdByStudent.set(row.id, row.userId);
      }

      const copy = absenceMarkedNotification({
        sectionName: section.name,
        date: input.date,
      });

      for (const entry of absentEntries) {
        const userId = userIdByStudent.get(entry.studentId);
        if (!userId) continue;

        const created = await this.notifications.createInTx(tx, {
          tenantId: user.tenantId,
          userIds: [userId],
          kind: 'absence_marked',
          title: copy.title,
          body: copy.body,
          data: {
            kind: 'absence_marked',
            sectionId: section.id,
            date: input.date,
            studentId: entry.studentId,
          },
          dedupeKey: dedupeKeys.absenceMarked(input.date, entry.studentId),
        });
        notificationIds.push(...created);
      }
    }

    const rows = await tx
      .select()
      .from(schema.attendance)
      .where(
        and(
          eq(schema.attendance.tenantId, user.tenantId),
          eq(schema.attendance.sectionId, section.id),
          eq(schema.attendance.date, input.date),
        ),
      )
      .orderBy(schema.attendance.studentId);

    return { date: input.date, records: rows.map(toAttendance), notificationIds };
  }

  private async assertNotFuture(tx: Database, user: AuthUser, date: string): Promise<void> {
    const [tenant] = await tx
      .select({ timezone: schema.tenants.timezone })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, user.tenantId))
      .limit(1);

    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: tenant?.timezone ?? 'Asia/Manila',
    }).format(new Date());

    if (date > today) {
      throw new BadRequestException('attendance cannot be recorded for a future date');
    }
  }

  private async requireTeacherMembership(
    tx: Database,
    user: AuthUser,
    teacherId: string,
  ): Promise<void> {
    const [member] = await tx
      .select({ userId: schema.userTenants.userId })
      .from(schema.userTenants)
      .where(
        and(
          eq(schema.userTenants.tenantId, user.tenantId),
          eq(schema.userTenants.userId, teacherId),
          eq(schema.userTenants.role, 'teacher'),
        ),
      )
      .limit(1);

    if (!member) throw new BadRequestException('teacherId is not a teacher in this tenant');
  }

  private async requireStudentMembership(
    tx: Database,
    user: AuthUser,
    studentUserId: string,
  ): Promise<void> {
    const [member] = await tx
      .select({ userId: schema.userTenants.userId })
      .from(schema.userTenants)
      .where(
        and(
          eq(schema.userTenants.tenantId, user.tenantId),
          eq(schema.userTenants.userId, studentUserId),
          eq(schema.userTenants.role, 'student'),
        ),
      )
      .limit(1);

    if (!member) throw new BadRequestException('userId is not a student in this tenant');
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
