import type {
  ConsentCaptureInput,
  ConsentRecord,
  DsarExport,
  ErasureCategory,
  ErasurePlan,
  GuardianAccessMode,
  GuardianAccessSettings,
  GuardianAccessUpdateInput,
  GuardianAccountResult,
  GuardianConsentCaptureInput,
  GuardianLink,
  GuardianOverview,
  PrivacyConsentOverview,
  PrivacyNotice,
  PrivacyNoticeSettings,
  PrivacyNoticeUpdateInput,
} from '@lms/shared';
import {
  DEFAULT_GUARDIAN_ACCESS_MODE,
  guardianAccessModeSchema,
  privacyNoticeSchema,
} from '@lms/shared';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, count, desc, eq, inArray, type SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { AuthUser } from '../auth/auth.types';
import { DatabaseService, type Database } from '../database/database.service';
import * as schema from '../database/schema';
import { SupabaseAdminService } from './supabase-admin.service';

const iso = (value: Date | null) => value?.toISOString() ?? null;
const NOTICE_KEY = 'privacy.notice';
const GUARDIAN_ACCESS_KEY = 'privacy.guardian_access';

@Injectable()
export class PrivacyService {
  constructor(
    private readonly database: DatabaseService,
    private readonly supabase: SupabaseAdminService,
  ) {}

  notice(user: AuthUser): Promise<PrivacyNoticeSettings> {
    return this.database.withTenant(user.tenantId, (tx) =>
      this.loadNoticeSettings(tx, user.tenantId),
    );
  }

  updateNotice(user: AuthUser, input: PrivacyNoticeUpdateInput): Promise<PrivacyNoticeSettings> {
    return this.database.withTenant(user.tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(schema.tenantSettings)
        .where(
          and(
            eq(schema.tenantSettings.tenantId, user.tenantId),
            eq(schema.tenantSettings.key, NOTICE_KEY),
          ),
        )
        .limit(1)
        .for('update');

      const currentVersion = existing?.version ?? 0;
      if (input.version !== undefined && input.version !== currentVersion) {
        throw new ConflictException('privacy notice changed since it was loaded');
      }

      const previous = existing ? (this.parseNotice(existing.value)?.title ?? null) : null;
      const now = new Date();
      let version: number;

      if (existing) {
        version = existing.version + 1;
        await tx
          .update(schema.tenantSettings)
          .set({
            value: input.notice,
            version,
            updatedBy: user.userId,
            updatedAt: now,
          })
          .where(eq(schema.tenantSettings.id, existing.id));
      } else {
        version = 1;
        await tx.insert(schema.tenantSettings).values({
          tenantId: user.tenantId,
          key: NOTICE_KEY,
          value: input.notice,
          version,
          updatedBy: user.userId,
        });
      }

      await tx.insert(schema.auditLog).values({
        tenantId: user.tenantId,
        actorId: user.userId,
        action: 'privacy.notice_updated',
        entity: 'tenant_settings',
        entityId: NOTICE_KEY,
        metadata: { version, previousTitle: previous, title: input.notice.title },
      });

      return { notice: input.notice, version, updatedAt: now.toISOString() };
    });
  }

  guardianAccess(user: AuthUser): Promise<GuardianAccessSettings> {
    return this.database.withTenant(user.tenantId, (tx) =>
      this.loadGuardianAccess(tx, user.tenantId),
    );
  }

  updateGuardianAccess(
    user: AuthUser,
    input: GuardianAccessUpdateInput,
  ): Promise<GuardianAccessSettings> {
    return this.database.withTenant(user.tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(schema.tenantSettings)
        .where(
          and(
            eq(schema.tenantSettings.tenantId, user.tenantId),
            eq(schema.tenantSettings.key, GUARDIAN_ACCESS_KEY),
          ),
        )
        .limit(1)
        .for('update');

      const currentVersion = existing?.version ?? 0;
      if (input.version !== undefined && input.version !== currentVersion) {
        throw new ConflictException('guardian access setting changed since it was loaded');
      }

      const previous = existing
        ? (this.parseGuardianMode(existing.value) ?? DEFAULT_GUARDIAN_ACCESS_MODE)
        : null;
      const now = new Date();
      let version: number;

      if (existing) {
        version = existing.version + 1;
        await tx
          .update(schema.tenantSettings)
          .set({
            value: { mode: input.mode },
            version,
            updatedBy: user.userId,
            updatedAt: now,
          })
          .where(eq(schema.tenantSettings.id, existing.id));
      } else {
        version = 1;
        await tx.insert(schema.tenantSettings).values({
          tenantId: user.tenantId,
          key: GUARDIAN_ACCESS_KEY,
          value: { mode: input.mode },
          version,
          updatedBy: user.userId,
        });
      }

      await tx.insert(schema.auditLog).values({
        tenantId: user.tenantId,
        actorId: user.userId,
        action: 'privacy.guardian_access_updated',
        entity: 'tenant_settings',
        entityId: GUARDIAN_ACCESS_KEY,
        metadata: { version, mode: input.mode, previousMode: previous },
      });

      return { mode: input.mode, version, updatedAt: now.toISOString() };
    });
  }

  async consents(user: AuthUser): Promise<PrivacyConsentOverview> {
    return this.database.withTenant(user.tenantId, async (tx) => ({
      notice: await this.loadNoticeSettings(tx, user.tenantId),
      consents: await this.listConsents(tx, user.tenantId),
    }));
  }

  captureConsent(
    user: AuthUser,
    studentId: string,
    input: ConsentCaptureInput,
  ): Promise<ConsentRecord> {
    return this.database.withTenant(user.tenantId, async (tx) => {
      await this.loadStudent(tx, user, studentId);
      const settings = await this.loadNoticeSettings(tx, user.tenantId);
      if (!settings.notice) {
        throw new BadRequestException('save the privacy notice before capturing consent');
      }

      const [row] = await tx
        .insert(schema.consentRecords)
        .values({
          tenantId: user.tenantId,
          studentId,
          noticeVersion: settings.version,
          status: input.status,
          guardianName: input.guardianName,
          guardianRelationship: input.guardianRelationship,
          guardianContact: input.guardianContact ?? null,
          note: input.note ?? null,
          capturedBy: user.userId,
        })
        .returning();
      if (!row) throw new Error('failed to record consent');

      const [student] = await tx
        .select({ firstName: schema.students.firstName, lastName: schema.students.lastName })
        .from(schema.students)
        .where(eq(schema.students.id, studentId))
        .limit(1);
      const [actor] = await tx
        .select({ displayName: schema.users.displayName, email: schema.users.email })
        .from(schema.users)
        .where(eq(schema.users.id, user.userId))
        .limit(1);

      await tx.insert(schema.auditLog).values({
        tenantId: user.tenantId,
        actorId: user.userId,
        action: 'privacy.consent_recorded',
        entity: 'student',
        entityId: studentId,
        metadata: { status: input.status, noticeVersion: settings.version },
      });

      return {
        id: row.id,
        studentId,
        studentName: student ? `${student.lastName}, ${student.firstName}` : studentId,
        guardianName: row.guardianName,
        guardianRelationship: row.guardianRelationship,
        guardianContact: row.guardianContact,
        status: input.status,
        noticeVersion: row.noticeVersion,
        note: row.note,
        capturedAt: row.capturedAt.toISOString(),
        capturedByName: actor?.displayName ?? actor?.email ?? null,
      };
    });
  }

  async guardians(user: AuthUser): Promise<GuardianLink[]> {
    return this.database.withTenant(user.tenantId, (tx) => this.listGuardians(tx, user.tenantId));
  }

  async createGuardian(
    user: AuthUser,
    input: {
      email: string;
      displayName: string;
      relationship: string;
      studentId: string;
    },
  ): Promise<GuardianAccountResult> {
    const email = input.email.trim().toLowerCase();

    const prepared = await this.database.withTenant(user.tenantId, async (tx) => {
      await this.loadStudent(tx, user, input.studentId);
      const access = await this.loadGuardianAccess(tx, user.tenantId);

      const [existingUser] = await tx
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, email))
        .limit(1);

      if (existingUser) {
        const [membership] = await tx
          .select({ role: schema.userTenants.role })
          .from(schema.userTenants)
          .where(
            and(
              eq(schema.userTenants.userId, existingUser.id),
              eq(schema.userTenants.tenantId, user.tenantId),
            ),
          )
          .limit(1);
        if (membership && membership.role !== 'parent') {
          throw new ConflictException(
            'that email already belongs to a different role in this school',
          );
        }
      }

      return { mode: access.mode, existingUserId: existingUser?.id ?? null };
    });

    const provision = prepared.existingUserId
      ? { userId: prepared.existingUserId, temporaryPassword: null, invited: false }
      : await this.supabase.provisionGuardian({
          email,
          displayName: input.displayName,
          mode: prepared.mode,
        });

    return this.database.withTenant(user.tenantId, async (tx) => {
      const now = new Date();
      await tx
        .insert(schema.users)
        .values({ id: provision.userId, email, displayName: input.displayName })
        .onConflictDoUpdate({
          target: schema.users.id,
          set: { displayName: input.displayName, updatedAt: now },
        });

      await tx
        .insert(schema.userTenants)
        .values({ userId: provision.userId, tenantId: user.tenantId, role: 'parent' })
        .onConflictDoNothing();

      const [link] = await tx
        .insert(schema.guardianStudents)
        .values({
          tenantId: user.tenantId,
          guardianUserId: provision.userId,
          studentId: input.studentId,
          relationship: input.relationship,
        })
        .onConflictDoUpdate({
          target: [
            schema.guardianStudents.tenantId,
            schema.guardianStudents.guardianUserId,
            schema.guardianStudents.studentId,
          ],
          set: { relationship: input.relationship },
        })
        .returning();
      if (!link) throw new Error('failed to link guardian');

      await tx.insert(schema.auditLog).values({
        tenantId: user.tenantId,
        actorId: user.userId,
        action: 'privacy.guardian_created',
        entity: 'guardian_students',
        entityId: link.id,
        metadata: {
          studentId: input.studentId,
          mode: prepared.mode,
          invited: provision.invited,
          existingAccount: Boolean(prepared.existingUserId),
        },
      });

      return {
        guardianUserId: provision.userId,
        email,
        displayName: input.displayName,
        studentId: input.studentId,
        relationship: input.relationship,
        mode: prepared.mode,
        invited: provision.invited,
        temporaryPassword: provision.temporaryPassword,
      };
    });
  }

  async guardianOverview(user: AuthUser): Promise<GuardianOverview> {
    return this.database.withTenant(user.tenantId, async (tx) => {
      const notice = await this.loadNoticeSettings(tx, user.tenantId);
      const links = await tx
        .select({
          studentId: schema.guardianStudents.studentId,
          relationship: schema.guardianStudents.relationship,
          firstName: schema.students.firstName,
          lastName: schema.students.lastName,
        })
        .from(schema.guardianStudents)
        .innerJoin(schema.students, eq(schema.guardianStudents.studentId, schema.students.id))
        .where(
          and(
            eq(schema.guardianStudents.tenantId, user.tenantId),
            eq(schema.guardianStudents.guardianUserId, user.userId),
          ),
        )
        .orderBy(schema.students.lastName, schema.students.firstName);

      const studentIds = links.map((link) => link.studentId);
      const consents = studentIds.length
        ? await tx
            .select({
              studentId: schema.consentRecords.studentId,
              status: schema.consentRecords.status,
              noticeVersion: schema.consentRecords.noticeVersion,
              capturedAt: schema.consentRecords.capturedAt,
            })
            .from(schema.consentRecords)
            .where(
              and(
                eq(schema.consentRecords.tenantId, user.tenantId),
                inArray(schema.consentRecords.studentId, studentIds),
              ),
            )
            .orderBy(desc(schema.consentRecords.capturedAt))
        : [];

      const latest = new Map<string, (typeof consents)[number]>();
      for (const consent of consents) {
        if (!latest.has(consent.studentId)) latest.set(consent.studentId, consent);
      }

      return {
        notice,
        students: links.map((link) => {
          const consent = latest.get(link.studentId);
          return {
            studentId: link.studentId,
            firstName: link.firstName,
            lastName: link.lastName,
            relationship: link.relationship,
            consentStatus: consent?.status ?? null,
            consentNoticeVersion: consent?.noticeVersion ?? null,
            consentAt: iso(consent?.capturedAt ?? null),
          };
        }),
      };
    });
  }

  captureGuardianConsent(
    user: AuthUser,
    studentId: string,
    input: GuardianConsentCaptureInput,
  ): Promise<ConsentRecord> {
    return this.database.withTenant(user.tenantId, async (tx) => {
      const [link] = await tx
        .select({ relationship: schema.guardianStudents.relationship })
        .from(schema.guardianStudents)
        .where(
          and(
            eq(schema.guardianStudents.tenantId, user.tenantId),
            eq(schema.guardianStudents.guardianUserId, user.userId),
            eq(schema.guardianStudents.studentId, studentId),
          ),
        )
        .limit(1);
      if (!link) throw new NotFoundException('student not found');

      const settings = await this.loadNoticeSettings(tx, user.tenantId);
      if (!settings.notice) {
        throw new BadRequestException('the school has not published a privacy notice yet');
      }

      const [student] = await tx
        .select({ firstName: schema.students.firstName, lastName: schema.students.lastName })
        .from(schema.students)
        .where(
          and(eq(schema.students.tenantId, user.tenantId), eq(schema.students.id, studentId)),
        )
        .limit(1);
      const [actor] = await tx
        .select({ displayName: schema.users.displayName, email: schema.users.email })
        .from(schema.users)
        .where(eq(schema.users.id, user.userId))
        .limit(1);

      const [row] = await tx
        .insert(schema.consentRecords)
        .values({
          tenantId: user.tenantId,
          studentId,
          noticeVersion: settings.version,
          status: input.status,
          guardianName: actor?.displayName ?? actor?.email ?? 'Guardian',
          guardianRelationship: link.relationship,
          guardianContact: actor?.email ?? user.email ?? null,
          note: input.note ?? null,
          capturedBy: user.userId,
        })
        .returning();
      if (!row) throw new Error('failed to record consent');

      await tx.insert(schema.auditLog).values({
        tenantId: user.tenantId,
        actorId: user.userId,
        action: 'privacy.consent_recorded',
        entity: 'student',
        entityId: studentId,
        metadata: { status: input.status, noticeVersion: settings.version, selfService: true },
      });

      return {
        id: row.id,
        studentId,
        studentName: student ? `${student.lastName}, ${student.firstName}` : studentId,
        guardianName: row.guardianName,
        guardianRelationship: row.guardianRelationship,
        guardianContact: row.guardianContact,
        status: row.status,
        noticeVersion: row.noticeVersion,
        note: row.note,
        capturedAt: row.capturedAt.toISOString(),
        capturedByName: actor?.displayName ?? actor?.email ?? null,
      };
    });
  }

  private async listGuardians(tx: Database, tenantId: string): Promise<GuardianLink[]> {
    const rows = await tx
      .select({
        id: schema.guardianStudents.id,
        guardianUserId: schema.guardianStudents.guardianUserId,
        email: schema.users.email,
        displayName: schema.users.displayName,
        studentId: schema.guardianStudents.studentId,
        firstName: schema.students.firstName,
        lastName: schema.students.lastName,
        relationship: schema.guardianStudents.relationship,
        createdAt: schema.guardianStudents.createdAt,
      })
      .from(schema.guardianStudents)
      .innerJoin(schema.users, eq(schema.guardianStudents.guardianUserId, schema.users.id))
      .innerJoin(schema.students, eq(schema.guardianStudents.studentId, schema.students.id))
      .where(eq(schema.guardianStudents.tenantId, tenantId))
      .orderBy(desc(schema.guardianStudents.createdAt))
      .limit(500);

    return rows.map((row) => ({
      id: row.id,
      guardianUserId: row.guardianUserId,
      email: row.email,
      displayName: row.displayName,
      studentId: row.studentId,
      studentName: `${row.lastName}, ${row.firstName}`,
      relationship: row.relationship,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  private async loadGuardianAccess(
    tx: Database,
    tenantId: string,
  ): Promise<GuardianAccessSettings> {
    const [row] = await tx
      .select()
      .from(schema.tenantSettings)
      .where(
        and(
          eq(schema.tenantSettings.tenantId, tenantId),
          eq(schema.tenantSettings.key, GUARDIAN_ACCESS_KEY),
        ),
      )
      .limit(1);

    return {
      mode: (row ? this.parseGuardianMode(row.value) : null) ?? DEFAULT_GUARDIAN_ACCESS_MODE,
      version: row?.version ?? 0,
      updatedAt: iso(row?.updatedAt ?? null),
    };
  }

  private parseGuardianMode(value: Record<string, unknown>): GuardianAccessMode | null {
    const parsed = guardianAccessModeSchema.safeParse(value.mode);
    return parsed.success ? parsed.data : null;
  }

  private async loadNoticeSettings(tx: Database, tenantId: string): Promise<PrivacyNoticeSettings> {

    const [row] = await tx
      .select()
      .from(schema.tenantSettings)
      .where(
        and(
          eq(schema.tenantSettings.tenantId, tenantId),
          eq(schema.tenantSettings.key, NOTICE_KEY),
        ),
      )
      .limit(1);

    return {
      notice: row ? this.parseNotice(row.value) : null,
      version: row?.version ?? 0,
      updatedAt: iso(row?.updatedAt ?? null),
    };
  }

  private parseNotice(value: Record<string, unknown>): PrivacyNotice | null {
    const parsed = privacyNoticeSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  }

  private async listConsents(tx: Database, tenantId: string): Promise<ConsentRecord[]> {
    const rows = await tx
      .select({
        id: schema.consentRecords.id,
        studentId: schema.consentRecords.studentId,
        firstName: schema.students.firstName,
        lastName: schema.students.lastName,
        guardianName: schema.consentRecords.guardianName,
        guardianRelationship: schema.consentRecords.guardianRelationship,
        guardianContact: schema.consentRecords.guardianContact,
        status: schema.consentRecords.status,
        noticeVersion: schema.consentRecords.noticeVersion,
        note: schema.consentRecords.note,
        capturedAt: schema.consentRecords.capturedAt,
        capturedByName: schema.users.displayName,
        capturedByEmail: schema.users.email,
      })
      .from(schema.consentRecords)
      .innerJoin(schema.students, eq(schema.consentRecords.studentId, schema.students.id))
      .leftJoin(schema.users, eq(schema.consentRecords.capturedBy, schema.users.id))
      .where(eq(schema.consentRecords.tenantId, tenantId))
      .orderBy(desc(schema.consentRecords.capturedAt))
      .limit(200);

    return rows.map((row) => ({
      id: row.id,
      studentId: row.studentId,
      studentName: `${row.lastName}, ${row.firstName}`,
      guardianName: row.guardianName,
      guardianRelationship: row.guardianRelationship,
      guardianContact: row.guardianContact,
      status: row.status,
      noticeVersion: row.noticeVersion,
      note: row.note,
      capturedAt: row.capturedAt.toISOString(),
      capturedByName: row.capturedByName ?? row.capturedByEmail ?? null,
    }));
  }

  dsarExport(user: AuthUser, studentId: string): Promise<DsarExport> {
    return this.database.withTenant(user.tenantId, async (tx) => {
      const student = await this.loadStudent(tx, user, studentId);
      const userId = student.userId;

      const [tenant] = await tx
        .select({
          id: schema.tenants.id,
          name: schema.tenants.name,
          timezone: schema.tenants.timezone,
        })
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
        .innerJoin(
          schema.gradeCategories,
          eq(schema.gradeItems.categoryId, schema.gradeCategories.id),
        )
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
        .innerJoin(
          schema.gradingPeriods,
          eq(schema.gradeOverrides.periodId, schema.gradingPeriods.id),
        )
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
        metadata: {
          categories: categories.length,
          rows: categories.reduce((sum, c) => sum + c.rows, 0),
        },
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
