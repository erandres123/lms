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
const STUDENT_ID = randomUUID();
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET ?? 'test-only-secret-change-me-0123456789';

const NOTICE = {
  title: 'Pilot privacy notice',
  body: 'What we collect, why we collect it, and how families can exercise their rights.',
};

const CONSENT = {
  guardianName: 'Maria Dela Cruz',
  guardianRelationship: 'Mother',
  guardianContact: '+63 900 000 0000',
  status: 'granted' as const,
};

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

suite('privacy notice and guardian consent (integration)', () => {
  let app: INestApplication;
  let pool: Pool;
  let adminToken: string;
  let teacherToken: string;
  let otherTenantToken: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    const suffix = TENANT_ID.slice(0, 8);

    await pool.query(
      `insert into tenants (id, slug, name)
       values ($1, $2, 'Privacy School'), ($3, $4, 'Privacy Other School')`,
      [TENANT_ID, `privacy-${suffix}`, OTHER_TENANT_ID, `privacy-other-${suffix}`],
    );
    await pool.query(
      `insert into users (id, email, display_name)
       values ($1, $2, 'Privacy Admin'), ($3, $4, 'Privacy Teacher')`,
      [
        ADMIN_ID,
        `privacy-admin-${suffix}@school.ph`,
        TEACHER_ID,
        `privacy-teacher-${suffix}@school.ph`,
      ],
    );
    await pool.query(
      `insert into user_tenants (user_id, tenant_id, role)
       values ($1, $2, 'school_admin'), ($1, $3, 'school_admin'), ($4, $2, 'teacher')`,
      [ADMIN_ID, TENANT_ID, OTHER_TENANT_ID, TEACHER_ID],
    );
    await pool.query(
      `insert into students (id, tenant_id, first_name, last_name, lrn)
       values ($1, $2, 'Ana', 'Cruz', '900000000001')`,
      [STUDENT_ID, TENANT_ID],
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
      await pool.query('delete from users where id = any($1)', [[ADMIN_ID, TEACHER_ID]]);
      await pool.end();
    }
  });

  it('serves an empty notice to every signed-in role', async () => {
    for (const bearer of [adminToken, teacherToken]) {
      const response = await request(app.getHttpServer())
        .get('/v1/privacy/notice')
        .set('Authorization', `Bearer ${bearer}`)
        .expect(200);
      expect(response.body).toEqual({ notice: null, version: 0, updatedAt: null });
    }
  });

  it('refuses consent before a notice exists', async () => {
    await request(app.getHttpServer())
      .post(`/v1/privacy/students/${STUDENT_ID}/consents`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(CONSENT)
      .expect(400);
  });

  it('lets only admins publish the notice, with optimistic versioning', async () => {
    await request(app.getHttpServer())
      .put('/v1/privacy/notice')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ notice: NOTICE, version: 0 })
      .expect(403);

    await request(app.getHttpServer())
      .put('/v1/privacy/notice')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notice: { title: ' ', body: '' }, version: 0 })
      .expect(400);

    const saved = await request(app.getHttpServer())
      .put('/v1/privacy/notice')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notice: NOTICE, version: 0 })
      .expect(200);

    expect(saved.body).toMatchObject({ notice: NOTICE, version: 1 });
    expect(saved.body.updatedAt).not.toBeNull();

    await request(app.getHttpServer())
      .put('/v1/privacy/notice')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notice: NOTICE, version: 0 })
      .expect(409);
  });

  it('captures consent against the published version and keeps history', async () => {
    const captured = await request(app.getHttpServer())
      .post(`/v1/privacy/students/${STUDENT_ID}/consents`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(CONSENT)
      .expect(201);

    expect(captured.body).toMatchObject({
      studentId: STUDENT_ID,
      studentName: 'Cruz, Ana',
      guardianName: CONSENT.guardianName,
      status: 'granted',
      noticeVersion: 1,
      capturedByName: 'Privacy Admin',
    });

    await request(app.getHttpServer())
      .post(`/v1/privacy/students/${STUDENT_ID}/consents`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...CONSENT, guardianName: ' ' })
      .expect(400);

    await request(app.getHttpServer())
      .put('/v1/privacy/notice')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notice: { ...NOTICE, title: 'Pilot privacy notice v2' }, version: 1 })
      .expect(200);

    const withdrawn = await request(app.getHttpServer())
      .post(`/v1/privacy/students/${STUDENT_ID}/consents`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...CONSENT, status: 'withdrawn', note: 'Family moved abroad.' })
      .expect(201);
    expect(withdrawn.body).toMatchObject({ status: 'withdrawn', noticeVersion: 2 });

    const overview = await request(app.getHttpServer())
      .get('/v1/privacy/consents')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(overview.body.notice.version).toBe(2);
    expect(overview.body.consents.map((row: { status: string }) => row.status)).toEqual([
      'withdrawn',
      'granted',
    ]);
    expect(overview.body.consents[1].noticeVersion).toBe(1);
  });

  it('keeps consent admin-only and tenant-scoped', async () => {
    await request(app.getHttpServer())
      .get('/v1/privacy/consents')
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .post(`/v1/privacy/students/${STUDENT_ID}/consents`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send(CONSENT)
      .expect(403);

    const other = await request(app.getHttpServer())
      .get('/v1/privacy/consents')
      .set('Authorization', `Bearer ${otherTenantToken}`)
      .expect(200);
    expect(other.body.notice.version).toBe(0);
    expect(other.body.consents).toEqual([]);

    await request(app.getHttpServer())
      .post(`/v1/privacy/students/${STUDENT_ID}/consents`)
      .set('Authorization', `Bearer ${otherTenantToken}`)
      .send(CONSENT)
      .expect(404);
  });

  it('audits every notice and consent change', async () => {
    const audit = await pool.query(
      'select action from audit_log where tenant_id = $1 order by created_at',
      [TENANT_ID],
    );
    expect(audit.rows.map((row) => row.action)).toEqual([
      'privacy.notice_updated',
      'privacy.consent_recorded',
      'privacy.notice_updated',
      'privacy.consent_recorded',
    ]);
  });
});
