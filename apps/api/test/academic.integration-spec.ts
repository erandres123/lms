import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SignJWT } from 'jose';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

const TENANT_ID = randomUUID();
const OTHER_TENANT_ID = randomUUID();
const ADMIN_ID = randomUUID();
const TEACHER_ID = randomUUID();
const OTHER_TEACHER_ID = randomUUID();
const STUDENT_USER_ID = randomUUID();
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET ?? 'test-only-secret-change-me-0123456789';

const today = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());

const tomorrow = () => '2099-12-31';

async function token(
  userId: string,
  tenantId = TENANT_ID,
  role: 'school_admin' | 'teacher' | 'student' = 'school_admin',
): Promise<string> {
  return new SignJWT({ tenant_id: tenantId, app_role: role, email: `${role}@school.ph` })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(new TextEncoder().encode(JWT_SECRET));
}

suite('academic flow (integration)', () => {
  let app: INestApplication;
  let pool: Pool;
  let adminToken: string;
  let teacherToken: string;
  let studentToken: string;
  let otherAdminToken: string;
  let sectionId: string;
  let studentOneId: string;
  let studentTwoId: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    const suffix = TENANT_ID.slice(0, 8);

    await pool.query(
      `insert into tenants (id, slug, name)
       values ($1, $2, 'Pilot School'), ($3, $4, 'Other School')`,
      [TENANT_ID, `pilot-${suffix}`, OTHER_TENANT_ID, `other-${suffix}`],
    );

    await pool.query(
      `insert into users (id, email, display_name)
       values ($1, $2, 'Admin'), ($3, $4, 'Teacher'), ($5, $6, 'Other Teacher'), ($7, $8, 'Student')`,
      [
        ADMIN_ID,
        `admin-${suffix}@school.ph`,
        TEACHER_ID,
        `teacher-${suffix}@school.ph`,
        OTHER_TEACHER_ID,
        `other-teacher-${suffix}@school.ph`,
        STUDENT_USER_ID,
        `student-${suffix}@school.ph`,
      ],
    );

    await pool.query(
      `insert into user_tenants (user_id, tenant_id, role)
       values ($1, $2, 'school_admin'), ($1, $3, 'school_admin'),
              ($4, $2, 'teacher'), ($5, $2, 'teacher'), ($6, $2, 'student')`,
      [ADMIN_ID, TENANT_ID, OTHER_TENANT_ID, TEACHER_ID, OTHER_TEACHER_ID, STUDENT_USER_ID],
    );

    adminToken = await token(ADMIN_ID);
    teacherToken = await token(TEACHER_ID, TENANT_ID, 'teacher');
    studentToken = await token(STUDENT_USER_ID, TENANT_ID, 'student');
    otherAdminToken = await token(ADMIN_ID, OTHER_TENANT_ID);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (pool) {
      await pool.query('delete from change_log where tenant_id = any($1)', [
        [TENANT_ID, OTHER_TENANT_ID],
      ]);
      await pool.query('delete from audit_log where tenant_id = any($1)', [
        [TENANT_ID, OTHER_TENANT_ID],
      ]);
      await pool.query('delete from tenants where id = any($1)', [[TENANT_ID, OTHER_TENANT_ID]]);
      await pool.query('delete from users where id = any($1)', [
        [ADMIN_ID, TEACHER_ID, OTHER_TEACHER_ID, STUDENT_USER_ID],
      ]);
      await pool.end();
    }
  });

  it('runs section, roster, attendance, concurrency, and isolation end to end', async () => {
    const server = app.getHttpServer();

    const sectionResponse = await request(server)
      .post('/v1/sections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Grade 7 - Rizal', gradeLevel: 7, schoolYear: '2026-2027', teacherId: TEACHER_ID })
      .expect(201);

    sectionId = sectionResponse.body.id as string;

    const studentOne = await request(server)
      .post('/v1/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ firstName: 'Maria', lastName: 'Santos', userId: STUDENT_USER_ID })
      .expect(201);

    studentOneId = studentOne.body.id as string;

    const studentTwo = await request(server)
      .post('/v1/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ firstName: 'Jose', lastName: 'Reyes' })
      .expect(201);

    studentTwoId = studentTwo.body.id as string;

    const enrollResponse = await request(server)
      .post(`/v1/sections/${sectionId}/enrollments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentIds: [studentOne.body.id, studentTwo.body.id] })
      .expect(201);

    expect(enrollResponse.body).toMatchObject({ requested: 2, enrolled: 2 });

    const roster = await request(server)
      .get(`/v1/sections/${sectionId}/roster`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(roster.body.students).toHaveLength(2);

    const date = today();
    const firstSave = await request(server)
      .put(`/v1/sections/${sectionId}/attendance`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        date,
        entries: [
          { studentId: studentOne.body.id, status: 'present' },
          { studentId: studentTwo.body.id, status: 'absent', note: 'no show' },
        ],
      })
      .expect(200);

    expect(firstSave.body.records).toHaveLength(2);
    const firstVersion = firstSave.body.records[0].version as number;

    const secondSave = await request(server)
      .put(`/v1/sections/${sectionId}/attendance`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        date,
        entries: [{ studentId: studentOne.body.id, status: 'late', baseVersion: firstVersion }],
      })
      .expect(200);

    expect(secondSave.body.records.find((r: { studentId: string }) => r.studentId === studentOne.body.id))
      .toMatchObject({ status: 'late', version: firstVersion + 1 });

    await request(server)
      .put(`/v1/sections/${sectionId}/attendance`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        date,
        entries: [{ studentId: studentOne.body.id, status: 'present', baseVersion: firstVersion }],
      })
      .expect(409);

    const studentView = await request(server)
      .get(`/v1/sections/${sectionId}/attendance?date=${date}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);

    expect(studentView.body.records).toHaveLength(2);

    await request(server)
      .put(`/v1/sections/${sectionId}/attendance`)
      .set('Authorization', `Bearer ${await token(OTHER_TEACHER_ID, TENANT_ID, 'teacher')}`)
      .send({ date, entries: [{ studentId: studentOne.body.id, status: 'present' }] })
      .expect(403);

    await request(server)
      .get(`/v1/sections/${sectionId}/roster`)
      .set('Authorization', `Bearer ${await token(ADMIN_ID, OTHER_TENANT_ID)}`)
      .expect(404);

    await request(server)
      .put(`/v1/sections/${sectionId}/attendance`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ date: tomorrow(), entries: [{ studentId: studentOne.body.id, status: 'present' }] })
      .expect(400);

    const changeLog = await pool.query<{ operation: string }>(
      'select operation from change_log where tenant_id = $1',
      [TENANT_ID],
    );
    const operations = new Set(changeLog.rows.map((row) => row.operation));
    expect(operations.has('insert')).toBe(true);
    expect(operations.has('update')).toBe(true);

    const audit = await pool.query(
      "select count(*)::int as count from audit_log where tenant_id = $1 and action = 'attendance.saved'",
      [TENANT_ID],
    );
    expect(audit.rows[0].count).toBeGreaterThan(0);
  });

  it('aggregates weighted grades, applies overrides, and scopes student views', async () => {
    const server = app.getHttpServer();
    const auth = (value: string) => ({ Authorization: `Bearer ${value}` });

    const period = await request(server)
      .post('/v1/grading-periods')
      .set(auth(adminToken))
      .send({ name: 'Quarter 1', schoolYear: '2026-2027', sequence: 1 })
      .expect(201);
    const periodId = period.body.id as string;

    const written = await request(server)
      .post(`/v1/sections/${sectionId}/grade-categories`)
      .set(auth(adminToken))
      .send({ periodId, name: 'Written Work', weight: 60, sequence: 1 })
      .expect(201);

    const performance = await request(server)
      .post(`/v1/sections/${sectionId}/grade-categories`)
      .set(auth(adminToken))
      .send({ periodId, name: 'Performance Task', weight: 40, sequence: 2 })
      .expect(201);

    const quiz1 = await request(server)
      .post(`/v1/sections/${sectionId}/grade-items`)
      .set(auth(adminToken))
      .send({ periodId, categoryId: written.body.id, title: 'Quiz 1', maxScore: 100 })
      .expect(201);

    const quiz2 = await request(server)
      .post(`/v1/sections/${sectionId}/grade-items`)
      .set(auth(adminToken))
      .send({
        periodId,
        categoryId: written.body.id,
        title: 'Quiz 2',
        maxScore: 50,
        competencyCode: 'M7NS-Ia-1',
      })
      .expect(201);

    const task = await request(server)
      .post(`/v1/sections/${sectionId}/grade-items`)
      .set(auth(adminToken))
      .send({
        periodId,
        categoryId: performance.body.id,
        title: 'Performance Task 1',
        maxScore: 100,
      })
      .expect(201);

    const save = (
      itemId: string,
      entries: Array<{ studentId: string; score: number; baseVersion?: number }>,
    ) =>
      request(server)
        .put(`/v1/sections/${sectionId}/grades`)
        .set(auth(adminToken))
        .send({ itemId, entries });

    await save(quiz1.body.id, [
      { studentId: studentOneId, score: 90 },
      { studentId: studentTwoId, score: 80 },
    ]).expect(200);
    await save(quiz2.body.id, [
      { studentId: studentOneId, score: 40 },
      { studentId: studentTwoId, score: 30 },
    ]).expect(200);
    await save(task.body.id, [
      { studentId: studentOneId, score: 80 },
      { studentId: studentTwoId, score: 70 },
    ]).expect(200);

    const gradebook = await request(server)
      .get(`/v1/sections/${sectionId}/gradebook?periodId=${periodId}`)
      .set(auth(adminToken))
      .expect(200);

    expect(gradebook.body.weightsTotal).toBe(100);
    expect(gradebook.body.transmutationPolicy).toBe('deped-do8-2015');
    const byStudent = new Map<
      string,
      { percentage: number; transmutedGrade: number; effectiveGrade: number }
    >(
      gradebook.body.students.map((student: { studentId: string }) => [
        student.studentId,
        student,
      ]),
    );
    expect(byStudent.get(studentOneId)!.percentage).toBeCloseTo(84, 2);
    expect(byStudent.get(studentOneId)!.transmutedGrade).toBe(90);
    expect(byStudent.get(studentOneId)!.effectiveGrade).toBe(90);
    expect(byStudent.get(studentTwoId)!.percentage).toBeCloseTo(72, 2);
    expect(byStudent.get(studentTwoId)!.transmutedGrade).toBe(82);

    const overridden = await request(server)
      .put(`/v1/sections/${sectionId}/grade-overrides`)
      .set(auth(adminToken))
      .send({
        periodId,
        studentId: studentOneId,
        grade: 88,
        reason: 'Registrar correction after review',
      })
      .expect(200);

    expect(overridden.body.version).toBe(1);

    const withOverride = await request(server)
      .get(`/v1/sections/${sectionId}/gradebook?periodId=${periodId}`)
      .set(auth(adminToken))
      .expect(200);

    const overriddenStudent = withOverride.body.students.find(
      (student: { studentId: string }) => student.studentId === studentOneId,
    );
    expect(overriddenStudent.percentage).toBeCloseTo(84, 2);
    expect(overriddenStudent.effectiveGrade).toBe(88);
    expect(overriddenStudent.override).toMatchObject({ grade: 88, version: 1 });

    await request(server)
      .put(`/v1/sections/${sectionId}/grade-overrides`)
      .set(auth(adminToken))
      .send({ periodId, studentId: studentOneId, grade: 95 })
      .expect(400);

    await request(server)
      .put(`/v1/sections/${sectionId}/grades`)
      .set(auth(adminToken))
      .send({ itemId: quiz2.body.id, entries: [{ studentId: studentOneId, score: 51 }] })
      .expect(400);

    await save(quiz1.body.id, [
      { studentId: studentOneId, score: 95, baseVersion: 1 },
    ]).expect(200);

    await request(server)
      .put(`/v1/sections/${sectionId}/grades`)
      .set(auth(adminToken))
      .send({
        itemId: quiz1.body.id,
        entries: [{ studentId: studentOneId, score: 96, baseVersion: 1 }],
      })
      .expect(409);

    await request(server)
      .put(`/v1/sections/${sectionId}/grades`)
      .set(auth(await token(OTHER_TEACHER_ID, TENANT_ID, 'teacher')))
      .send({ itemId: quiz1.body.id, entries: [{ studentId: studentOneId, score: 70 }] })
      .expect(403);

    const studentView = await request(server)
      .get(`/v1/sections/${sectionId}/gradebook?periodId=${periodId}`)
      .set(auth(studentToken))
      .expect(200);

    expect(studentView.body.students).toHaveLength(1);
    expect(studentView.body.students[0].studentId).toBe(studentOneId);
  });

  it('returns a resumable, tenant- and role-scoped change feed', async () => {
    const server = app.getHttpServer();

    const adminPull = await request(server)
      .get('/v1/sync/pull?cursor=0&limit=500')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const adminTables = new Set(
      adminPull.body.changes.map((change: { table: string }) => change.table),
    );
    expect([...adminTables]).toEqual(
      expect.arrayContaining([
        'sections',
        'students',
        'enrollments',
        'attendance',
        'grading_periods',
        'grades',
      ]),
    );
    expect(adminPull.body.nextCursor).toBeGreaterThan(0);
    expect(
      adminPull.body.changes.every((change: { data: unknown }) => change.data !== null),
    ).toBe(true);

    const firstPage = await request(server)
      .get('/v1/sync/pull?cursor=0&limit=2')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(firstPage.body.changes).toHaveLength(2);
    expect(firstPage.body.hasMore).toBe(true);
    expect(firstPage.body.nextCursor).toBe(firstPage.body.changes[1].seq);

    const secondPage = await request(server)
      .get(`/v1/sync/pull?cursor=${firstPage.body.nextCursor}&limit=2`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(
      secondPage.body.changes.every(
        (change: { seq: number }) => change.seq > firstPage.body.nextCursor,
      ),
    ).toBe(true);

    const resumed = await request(server)
      .get(`/v1/sync/pull?cursor=${adminPull.body.nextCursor}&limit=500`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(resumed.body.changes).toHaveLength(0);
    expect(resumed.body.nextCursor).toBe(adminPull.body.nextCursor);

    const studentPull = await request(server)
      .get('/v1/sync/pull?cursor=0&limit=500')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);

    const visibleStudentRows = studentPull.body.changes.filter(
      (change: { table: string }) => change.table === 'students',
    );
    expect(visibleStudentRows.map((change: { rowId: string }) => change.rowId)).toEqual([
      studentOneId,
    ]);
    expect(
      studentPull.body.changes.some(
        (change: { rowId: string }) => change.rowId === studentTwoId,
      ),
    ).toBe(false);
    expect(
      studentPull.body.changes.some((change: { table: string }) => change.table === 'attendance'),
    ).toBe(true);

    const studentGrades = studentPull.body.changes.filter(
      (change: { table: string }) => change.table === 'grades',
    );
    expect(studentGrades.length).toBeGreaterThan(0);
    expect(
      studentGrades.every(
        (change: { data: { studentId: string } | null }) =>
          change.data?.studentId === studentOneId,
      ),
    ).toBe(true);

    const otherTenant = await request(server)
      .get('/v1/sync/pull?cursor=0&limit=500')
      .set('Authorization', `Bearer ${otherAdminToken}`)
      .expect(200);

    expect(otherTenant.body.changes).toHaveLength(0);
  });
});
