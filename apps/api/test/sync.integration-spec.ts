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
const ADMIN_ID = randomUUID();
const TEACHER_ID = randomUUID();
const STUDENT_USER_ID = randomUUID();
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET ?? 'test-only-secret-change-me-0123456789';

const today = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());

async function token(
  userId: string,
  role: 'school_admin' | 'teacher' | 'student' = 'school_admin',
): Promise<string> {
  return new SignJWT({ tenant_id: TENANT_ID, app_role: role, email: `${role}@school.ph` })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(new TextEncoder().encode(JWT_SECRET));
}

suite('sync push and pull (integration)', () => {
  let app: INestApplication;
  let pool: Pool;
  let adminToken: string;
  let teacherToken: string;
  let studentToken: string;
  let sectionId: string;
  let studentOneId: string;
  let studentTwoId: string;
  const date = today();

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    const suffix = TENANT_ID.slice(0, 8);

    await pool.query(`insert into tenants (id, slug, name) values ($1, $2, 'Sync School')`, [
      TENANT_ID,
      `sync-${suffix}`,
    ]);
    await pool.query(
      `insert into users (id, email, display_name)
       values ($1, $2, 'Admin'), ($3, $4, 'Teacher'), ($5, $6, 'Student')`,
      [
        ADMIN_ID,
        `admin-${suffix}@school.ph`,
        TEACHER_ID,
        `teacher-${suffix}@school.ph`,
        STUDENT_USER_ID,
        `student-${suffix}@school.ph`,
      ],
    );
    await pool.query(
      `insert into user_tenants (user_id, tenant_id, role)
       values ($1, $2, 'school_admin'), ($3, $2, 'teacher'), ($4, $2, 'student')`,
      [ADMIN_ID, TENANT_ID, TEACHER_ID, STUDENT_USER_ID],
    );

    adminToken = await token(ADMIN_ID);
    teacherToken = await token(TEACHER_ID, 'teacher');
    studentToken = await token(STUDENT_USER_ID, 'student');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();

    const server = app.getHttpServer();
    const section = await request(server)
      .post('/v1/sections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Grade 8 - Mabini', gradeLevel: 8, schoolYear: '2026-2027', teacherId: TEACHER_ID })
      .expect(201);
    sectionId = section.body.id as string;

    studentOneId = (
      await request(server)
        .post('/v1/students')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ firstName: 'Ana', lastName: 'Cruz', userId: STUDENT_USER_ID })
        .expect(201)
    ).body.id as string;

    studentTwoId = (
      await request(server)
        .post('/v1/students')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ firstName: 'Ben', lastName: 'Reyes' })
        .expect(201)
    ).body.id as string;

    await request(server)
      .post(`/v1/sections/${sectionId}/enrollments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentIds: [studentOneId, studentTwoId] })
      .expect(201);
  });

  afterAll(async () => {
    if (app) await app.close();
    if (pool) {
      await pool.query('delete from change_log where tenant_id = $1', [TENANT_ID]);
      await pool.query('delete from audit_log where tenant_id = $1', [TENANT_ID]);
      await pool.query('delete from tenants where id = $1', [TENANT_ID]);
      await pool.query('delete from users where id = any($1)', [
        [ADMIN_ID, TEACHER_ID, STUDENT_USER_ID],
      ]);
      await pool.end();
    }
  });

  it('applies an offline attendance save exactly once', async () => {
    const server = app.getHttpServer();
    const clientOpId = randomUUID();
    const operations = [
      {
        clientOpId,
        kind: 'attendance.save',
        sectionId,
        date,
        entries: [
          { studentId: studentOneId, status: 'present' },
          { studentId: studentTwoId, status: 'absent' },
        ],
      },
    ];

    const first = await request(server)
      .post('/v1/sync/push')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ operations })
      .expect(201);

    expect(first.body.results).toEqual([{ clientOpId, status: 'applied' }]);

    const retry = await request(server)
      .post('/v1/sync/push')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ operations })
      .expect(201);

    expect(retry.body.results[0]).toMatchObject({
      clientOpId,
      status: 'duplicate',
      storedStatus: 'applied',
    });

    const rows = await pool.query(
      'select version, status from attendance where tenant_id = $1 and date = $2 order by student_id',
      [TENANT_ID, date],
    );
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows.map((row) => row.version)).toEqual([1, 1]);

    const receipts = await pool.query(
      'select status from sync_operations where tenant_id = $1 and client_op_id = $2',
      [TENANT_ID, clientOpId],
    );
    expect(receipts.rows).toEqual([{ status: 'applied' }]);
  });

  it('rejects students and reports a stale baseVersion without partial writes', async () => {
    const server = app.getHttpServer();

    await request(server)
      .post('/v1/sync/push')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        operations: [
          {
            clientOpId: randomUUID(),
            kind: 'attendance.save',
            sectionId,
            date,
            entries: [{ studentId: studentOneId, status: 'late' }],
          },
        ],
      })
      .expect(403);

    const clientOpId = randomUUID();
    const conflicting = {
      clientOpId,
      kind: 'attendance.save',
      sectionId,
      date,
      entries: [
        { studentId: studentTwoId, status: 'late' },
        { studentId: studentOneId, status: 'late', baseVersion: 1 },
      ],
    };

    // Advance student one so the queued baseVersion becomes stale.
    await request(server)
      .put(`/v1/sections/${sectionId}/attendance`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ date, entries: [{ studentId: studentOneId, status: 'excused', baseVersion: 1 }] })
      .expect(200);

    const conflict = await request(server)
      .post('/v1/sync/push')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ operations: [conflicting] })
      .expect(201);

    expect(conflict.body.results[0]).toMatchObject({
      clientOpId,
      status: 'conflict',
      conflict: { studentId: studentOneId },
    });

    const rows = await pool.query(
      'select student_id, status, version from attendance where tenant_id = $1 and date = $2',
      [TENANT_ID, date],
    );
    const byStudent = new Map(
      rows.rows.map((row) => [row.student_id as string, row as { status: string; version: number }]),
    );
    expect(byStudent.get(studentOneId)).toMatchObject({ status: 'excused', version: 2 });
    expect(byStudent.get(studentTwoId)).toMatchObject({ status: 'absent', version: 1 });

    const retry = await request(server)
      .post('/v1/sync/push')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ operations: [conflicting] })
      .expect(201);

    expect(retry.body.results[0]).toMatchObject({
      clientOpId,
      status: 'duplicate',
      storedStatus: 'conflict',
      conflict: { studentId: studentOneId },
    });
  });

  it('reports sync telemetry to admins only', async () => {
    const server = app.getHttpServer();

    await request(server)
      .get('/v1/sync/stats')
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(403);

    const stats = await request(server)
      .get('/v1/sync/stats')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(stats.body).toEqual({ applied: 1, conflicts: 1, total: 2 });
  });

  it('pages changes by cursor and forwards tombstones', async () => {
    const server = app.getHttpServer();

    const firstPage = await request(server)
      .get('/v1/sync/pull?cursor=0&limit=2')
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);

    expect(firstPage.body.changes.length).toBeLessThanOrEqual(2);
    expect(firstPage.body.hasMore).toBe(true);

    let cursor = firstPage.body.nextCursor as number;
    let pages = 1;
    let sawAttendance = firstPage.body.changes.some(
      (change: { table: string }) => change.table === 'attendance',
    );

    while (pages < 50) {
      const page = await request(server)
        .get(`/v1/sync/pull?cursor=${cursor}&limit=50`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .expect(200);

      sawAttendance ||= page.body.changes.some(
        (change: { table: string }) => change.table === 'attendance',
      );
      cursor = page.body.nextCursor as number;
      pages += 1;
      if (!page.body.hasMore) break;
    }

    expect(sawAttendance).toBe(true);

    const [row] = (
      await pool.query(
        'select id from attendance where tenant_id = $1 and student_id = $2 and date = $3',
        [TENANT_ID, studentTwoId, date],
      )
    ).rows;
    await pool.query('delete from attendance where id = $1', [row.id]);

    const afterDelete = await request(server)
      .get(`/v1/sync/pull?cursor=${cursor}&limit=50`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);

    expect(afterDelete.body.changes).toContainEqual(
      expect.objectContaining({
        table: 'attendance',
        operation: 'delete',
        rowId: row.id,
        data: null,
      }),
    );
  });
});
