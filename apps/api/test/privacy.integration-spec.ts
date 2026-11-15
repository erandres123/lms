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
const STUDENT_USER_ID = randomUUID();
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET ?? 'test-only-secret-change-me-0123456789';

const todayInManila = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());

async function token(
  userId: string,
  tenantId = TENANT_ID,
  role: 'school_admin' | 'teacher' = 'school_admin',
): Promise<string> {
  return new SignJWT({ tenant_id: tenantId, app_role: role, email: `${role}@school.ph` })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(new TextEncoder().encode(JWT_SECRET));
}

suite('privacy DSAR and erasure dry-run (integration)', () => {
  let app: INestApplication;
  let pool: Pool;
  let adminToken: string;
  let teacherToken: string;
  let otherTenantToken: string;
  let studentId: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    const suffix = TENANT_ID.slice(0, 8);

    await pool.query(
      `insert into tenants (id, slug, name)
       values ($1, $2, 'Privacy School'), ($3, $4, 'Other School')`,
      [TENANT_ID, `privacy-${suffix}`, OTHER_TENANT_ID, `privacy-other-${suffix}`],
    );

    await pool.query(
      `insert into users (id, email, display_name)
       values ($1, $2, 'Privacy Admin'), ($3, $4, 'Privacy Teacher'), ($5, $6, 'Privacy Student')`,
      [
        ADMIN_ID,
        `privacy-admin-${suffix}@school.ph`,
        TEACHER_ID,
        `privacy-teacher-${suffix}@school.ph`,
        STUDENT_USER_ID,
        `privacy-student-${suffix}@school.ph`,
      ],
    );

    await pool.query(
      `insert into user_tenants (user_id, tenant_id, role)
       values ($1, $2, 'school_admin'), ($1, $3, 'school_admin'),
              ($4, $2, 'teacher'), ($5, $2, 'student')`,
      [ADMIN_ID, TENANT_ID, OTHER_TENANT_ID, TEACHER_ID, STUDENT_USER_ID],
    );

    adminToken = await token(ADMIN_ID);
    teacherToken = await token(TEACHER_ID, TENANT_ID, 'teacher');
    otherTenantToken = await token(ADMIN_ID, OTHER_TENANT_ID);

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
        [ADMIN_ID, TEACHER_ID, STUDENT_USER_ID],
      ]);
      await pool.end();
    }
  });

  it('exports one student and previews erasure without changing data', async () => {
    const server = app.getHttpServer();
    const suffix = TENANT_ID.slice(0, 8);

    const section = await request(server)
      .post('/v1/sections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `Grade 7 - Privacy ${suffix}`, gradeLevel: 7, schoolYear: '2026-2027' })
      .expect(201);
    const sectionId = section.body.id as string;

    const student = await request(server)
      .post('/v1/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ firstName: 'Ana', lastName: 'Cruz', userId: STUDENT_USER_ID })
      .expect(201);
    studentId = student.body.id as string;

    await request(server)
      .post(`/v1/sections/${sectionId}/enrollments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentIds: [studentId] })
      .expect(201);

    await request(server)
      .put(`/v1/sections/${sectionId}/attendance`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ date: todayInManila(), entries: [{ studentId, status: 'present' }] })
      .expect(200);

    const periodId = randomUUID();
    const categoryId = randomUUID();
    const itemId = randomUUID();
    await pool.query(
      `insert into grading_periods (id, tenant_id, name, school_year, sequence)
       values ($1, $2, 'Quarter 1', '2026-2027', 1)`,
      [periodId, TENANT_ID],
    );
    await pool.query(
      `insert into grade_categories (id, tenant_id, section_id, period_id, name, weight)
       values ($1, $2, $3, $4, 'Written Work', 100)`,
      [categoryId, TENANT_ID, sectionId, periodId],
    );
    await pool.query(
      `insert into grade_items (id, tenant_id, section_id, period_id, category_id, title, max_score)
       values ($1, $2, $3, $4, $5, 'Quiz 1', 20)`,
      [itemId, TENANT_ID, sectionId, periodId, categoryId],
    );
    await pool.query(
      `insert into grades (id, tenant_id, item_id, student_id, score)
       values ($1, $2, $3, $4, 18)`,
      [randomUUID(), TENANT_ID, itemId, studentId],
    );
    await pool.query(
      `insert into notifications (id, tenant_id, user_id, kind, title, body)
       values ($1, $2, $3, 'grade_posted', 'Grade posted', 'Quiz 1 was graded')`,
      [randomUUID(), TENANT_ID, STUDENT_USER_ID],
    );
    await pool.query(
      `insert into push_devices (id, tenant_id, user_id, platform, token)
       values ($1, $2, $3, 'web', $4)`,
      [randomUUID(), TENANT_ID, STUDENT_USER_ID, `token-${suffix}`],
    );

    await request(server)
      .get(`/v1/privacy/students/${studentId}/export`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(403);

    await request(server)
      .get(`/v1/privacy/students/${studentId}/export`)
      .set('Authorization', `Bearer ${otherTenantToken}`)
      .expect(404);

    const exported = await request(server)
      .get(`/v1/privacy/students/${studentId}/export`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(exported.body.student).toMatchObject({ firstName: 'Ana', lastName: 'Cruz' });
    expect(exported.body.account.email).toContain('privacy-student-');
    expect(exported.body.enrollments).toHaveLength(1);
    expect(exported.body.attendance).toHaveLength(1);
    expect(exported.body.grades).toHaveLength(1);
    expect(exported.body.grades[0]).toMatchObject({ itemTitle: 'Quiz 1', score: 18 });
    expect(exported.body.notifications).toHaveLength(1);
    expect(exported.body.pushDevices).toHaveLength(1);
    expect(exported.body.pushDevices[0]).not.toHaveProperty('token');

    const plan = await request(server)
      .get(`/v1/privacy/students/${studentId}/erasure-dry-run`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(plan.body).toMatchObject({ dryRun: true, studentId });
    const byTable = new Map(
      (plan.body.categories as Array<{ table: string; rows: number; action: string }>).map(
        (category) => [category.table, category],
      ),
    );
    expect(byTable.get('students')).toMatchObject({ rows: 1, action: 'anonymize' });
    expect(byTable.get('users')).toMatchObject({ rows: 1, action: 'anonymize' });
    expect(byTable.get('enrollments')).toMatchObject({ rows: 1, action: 'retain' });
    expect(byTable.get('attendance')).toMatchObject({ rows: 1, action: 'retain' });
    expect(byTable.get('grades')).toMatchObject({ rows: 1, action: 'retain' });
    expect(byTable.get('notifications')).toMatchObject({ rows: 1, action: 'delete' });
    expect(byTable.get('push_devices')).toMatchObject({ rows: 1, action: 'delete' });

    const unchanged = await pool.query(
      `select (select count(*) from students where id = $1)::int as students,
              (select count(*) from attendance where student_id = $1)::int as attendance,
              (select count(*) from grades where student_id = $1)::int as grades,
              (select count(*) from notifications where user_id = $2)::int as notifications,
              (select count(*) from push_devices where user_id = $2)::int as devices`,
      [studentId, STUDENT_USER_ID],
    );
    expect(unchanged.rows[0]).toEqual({
      students: 1,
      attendance: 1,
      grades: 1,
      notifications: 1,
      devices: 1,
    });

    const audits = await pool.query(
      `select action from audit_log
       where tenant_id = $1 and entity_id = $2 and action like 'privacy.%'
       order by created_at`,
      [TENANT_ID, studentId],
    );
    expect(audits.rows.map((row) => row.action)).toEqual([
      'privacy.dsar_exported',
      'privacy.erasure_dry_run',
    ]);
  });
});
