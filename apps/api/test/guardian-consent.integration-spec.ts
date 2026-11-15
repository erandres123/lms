import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SignJWT } from 'jose';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { SupabaseAdminService } from '../src/privacy/supabase-admin.service';

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

const TENANT_ID = randomUUID();
const OTHER_TENANT_ID = randomUUID();
const ADMIN_ID = randomUUID();
const TEACHER_ID = randomUUID();
const STUDENT_ID = randomUUID();
const OTHER_STUDENT_ID = randomUUID();
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET ?? 'test-only-secret-change-me-0123456789';

const NOTICE = {
  title: 'Pilot privacy notice',
  body: 'What we collect, why we collect it, and how families can exercise their rights.',
};

async function token(
  userId: string,
  role: 'school_admin' | 'teacher' | 'parent',
  tenantId = TENANT_ID,
): Promise<string> {
  return new SignJWT({ tenant_id: tenantId, app_role: role, email: `${role}@school.ph` })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(new TextEncoder().encode(JWT_SECRET));
}

const provisionGuardian = async (input: {
  email: string;
  displayName: string;
  mode: string;
}): Promise<{ userId: string; temporaryPassword: string | null; invited: boolean }> => ({
  userId: randomUUID(),
  temporaryPassword: input.mode === 'admin_created' ? 'temp-pass-1234567890' : null,
  invited: input.mode === 'email_invite',
});

suite('guardian access and self-service consent (integration)', () => {
  let app: INestApplication;
  let pool: Pool;
  let adminToken: string;
  let teacherToken: string;
  let otherTenantTeacherToken: string;
  let guardianUserId = '';
  let guardianToken = '';
  let guardianEmail = '';
  let secondGuardianEmail = '';
  let magicLinkGuardianId = '';
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    const suffix = TENANT_ID.slice(0, 8);
    guardianEmail = `guardian-${suffix}@school.ph`;
    secondGuardianEmail = `guardian-two-${suffix}@school.ph`;

    await pool.query(
      `insert into tenants (id, slug, name)
       values ($1, $2, 'Guardian School'), ($3, $4, 'Guardian Other School')`,
      [TENANT_ID, `guardian-${suffix}`, OTHER_TENANT_ID, `guardian-other-${suffix}`],
    );
    await pool.query(
      `insert into users (id, email, display_name)
       values ($1, $2, 'Guardian Admin'), ($3, $4, 'Guardian Teacher')`,
      [
        ADMIN_ID,
        `guardian-admin-${suffix}@school.ph`,
        TEACHER_ID,
        `guardian-teacher-${suffix}@school.ph`,
      ],
    );
    await pool.query(
      `insert into user_tenants (user_id, tenant_id, role)
       values ($1, $2, 'school_admin'), ($1, $3, 'school_admin'), ($4, $2, 'teacher'), ($4, $3, 'teacher')`,
      [ADMIN_ID, TENANT_ID, OTHER_TENANT_ID, TEACHER_ID],
    );
    await pool.query(
      `insert into students (id, tenant_id, first_name, last_name, lrn)
       values ($1, $2, 'Ana', 'Cruz', '900000000011'), ($3, $4, 'Ben', 'Reyes', '900000000012')`,
      [STUDENT_ID, TENANT_ID, OTHER_STUDENT_ID, OTHER_TENANT_ID],
    );

    adminToken = await token(ADMIN_ID, 'school_admin');
    teacherToken = await token(TEACHER_ID, 'teacher');
    otherTenantTeacherToken = await token(TEACHER_ID, 'teacher', OTHER_TENANT_ID);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SupabaseAdminService)
      .useValue({ provisionGuardian })
      .compile();
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
        [ADMIN_ID, TEACHER_ID, ...createdUserIds],
      ]);
      await pool.end();
    }
  });

  it('defaults guardian access to admin-created and guards the setting', async () => {
    const initial = await request(app.getHttpServer())
      .get('/v1/privacy/guardian-access')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(initial.body).toEqual({ mode: 'admin_created', version: 0, updatedAt: null });

    await request(app.getHttpServer())
      .get('/v1/privacy/guardian-access')
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .put('/v1/privacy/guardian-access')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ mode: 'magic_link', version: 0 })
      .expect(403);

    await request(app.getHttpServer())
      .put('/v1/privacy/guardian-access')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ mode: 'sms', version: 0 })
      .expect(400);

    const saved = await request(app.getHttpServer())
      .put('/v1/privacy/guardian-access')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ mode: 'email_invite', version: 0 })
      .expect(200);
    expect(saved.body).toMatchObject({ mode: 'email_invite', version: 1 });

    await request(app.getHttpServer())
      .put('/v1/privacy/guardian-access')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ mode: 'magic_link', version: 0 })
      .expect(409);

    // Back to admin-created for the account tests below.
    await request(app.getHttpServer())
      .put('/v1/privacy/guardian-access')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ mode: 'admin_created', version: 1 })
      .expect(200);
  });

  it('lets only admins link a guardian within their tenant', async () => {
    await request(app.getHttpServer())
      .post('/v1/privacy/guardians')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        email: guardianEmail,
        displayName: 'Maria Dela Cruz',
        relationship: 'Mother',
        studentId: STUDENT_ID,
      })
      .expect(403);

    const created = await request(app.getHttpServer())
      .post('/v1/privacy/guardians')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: guardianEmail,
        displayName: 'Maria Dela Cruz',
        relationship: 'Mother',
        studentId: STUDENT_ID,
      })
      .expect(201);

    expect(created.body).toMatchObject({
      email: guardianEmail,
      displayName: 'Maria Dela Cruz',
      studentId: STUDENT_ID,
      relationship: 'Mother',
      mode: 'admin_created',
      invited: false,
      temporaryPassword: 'temp-pass-1234567890',
    });
    guardianUserId = created.body.guardianUserId;
    createdUserIds.push(guardianUserId);
    guardianToken = await token(guardianUserId, 'parent');

    const membership = await pool.query(
      'select role from user_tenants where user_id = $1 and tenant_id = $2',
      [guardianUserId, TENANT_ID],
    );
    expect(membership.rows).toEqual([{ role: 'parent' }]);

    await request(app.getHttpServer())
      .post('/v1/privacy/guardians')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: `other-${guardianEmail}`,
        displayName: 'Other Guardian',
        relationship: 'Father',
        studentId: OTHER_STUDENT_ID,
      })
      .expect(404);

    await request(app.getHttpServer())
      .get('/v1/privacy/guardians')
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(403);

    const list = await request(app.getHttpServer())
      .get('/v1/privacy/guardians')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({
      guardianUserId,
      email: guardianEmail,
      studentName: 'Cruz, Ana',
      relationship: 'Mother',
    });
  });

  it('reuses the linked account for a second student without a new password', async () => {
    const second = await request(app.getHttpServer())
      .post('/v1/privacy/guardians')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: guardianEmail,
        displayName: 'Maria Dela Cruz',
        relationship: 'Mother',
        studentId: STUDENT_ID,
      })
      .expect(201);
    expect(second.body).toMatchObject({
      guardianUserId,
      temporaryPassword: null,
      invited: false,
    });
  });

  it('creates invite and magic-link accounts without a temporary password', async () => {
    await request(app.getHttpServer())
      .put('/v1/privacy/guardian-access')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ mode: 'email_invite', version: 2 })
      .expect(200);

    const invited = await request(app.getHttpServer())
      .post('/v1/privacy/guardians')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: secondGuardianEmail,
        displayName: 'Jose Cruz',
        relationship: 'Father',
        studentId: STUDENT_ID,
      })
      .expect(201);
    expect(invited.body).toMatchObject({ mode: 'email_invite', invited: true, temporaryPassword: null });
    createdUserIds.push(invited.body.guardianUserId);

    await request(app.getHttpServer())
      .put('/v1/privacy/guardian-access')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ mode: 'magic_link', version: 3 })
      .expect(200);

    const magicLink = await request(app.getHttpServer())
      .post('/v1/privacy/guardians')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: `magic-${guardianEmail}`,
        displayName: 'Liza Cruz',
        relationship: 'Aunt',
        studentId: STUDENT_ID,
      })
      .expect(201);
    expect(magicLink.body).toMatchObject({ mode: 'magic_link', invited: false, temporaryPassword: null });
    magicLinkGuardianId = magicLink.body.guardianUserId;
    createdUserIds.push(magicLinkGuardianId);
  });

  it('serves the guardian overview only to linked parents in the tenant', async () => {
    await request(app.getHttpServer())
      .get('/v1/guardian/overview')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/v1/guardian/overview')
      .set('Authorization', `Bearer ${otherTenantTeacherToken}`)
      .expect(403);

    const overview = await request(app.getHttpServer())
      .get('/v1/guardian/overview')
      .set('Authorization', `Bearer ${guardianToken}`)
      .expect(200);
    expect(overview.body.notice.version).toBe(0);
    expect(overview.body.students).toEqual([
      {
        studentId: STUDENT_ID,
        firstName: 'Ana',
        lastName: 'Cruz',
        relationship: 'Mother',
        consentStatus: null,
        consentNoticeVersion: null,
        consentAt: null,
      },
    ]);
  });

  it('records self-service consent against the published notice', async () => {
    await request(app.getHttpServer())
      .post(`/v1/guardian/students/${STUDENT_ID}/consents`)
      .set('Authorization', `Bearer ${guardianToken}`)
      .send({ status: 'granted' })
      .expect(400);

    await request(app.getHttpServer())
      .put('/v1/privacy/notice')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notice: NOTICE, version: 0 })
      .expect(200);

    const captured = await request(app.getHttpServer())
      .post(`/v1/guardian/students/${STUDENT_ID}/consents`)
      .set('Authorization', `Bearer ${guardianToken}`)
      .send({ status: 'granted' })
      .expect(201);
    expect(captured.body).toMatchObject({
      studentId: STUDENT_ID,
      studentName: 'Cruz, Ana',
      guardianName: 'Maria Dela Cruz',
      guardianRelationship: 'Mother',
      guardianContact: guardianEmail,
      status: 'granted',
      noticeVersion: 1,
      capturedByName: 'Maria Dela Cruz',
    });

    const withdrawn = await request(app.getHttpServer())
      .post(`/v1/guardian/students/${STUDENT_ID}/consents`)
      .set('Authorization', `Bearer ${guardianToken}`)
      .send({ status: 'withdrawn', note: 'Moving schools.' })
      .expect(201);
    expect(withdrawn.body).toMatchObject({ status: 'withdrawn', noticeVersion: 1 });

    const overview = await request(app.getHttpServer())
      .get('/v1/guardian/overview')
      .set('Authorization', `Bearer ${guardianToken}`)
      .expect(200);
    expect(overview.body.students[0]).toMatchObject({
      consentStatus: 'withdrawn',
      consentNoticeVersion: 1,
    });

    const unlinked = await token(randomUUID(), 'parent');
    await request(app.getHttpServer())
      .post(`/v1/guardian/students/${STUDENT_ID}/consents`)
      .set('Authorization', `Bearer ${unlinked}`)
      .send({ status: 'granted' })
      .expect(404);
  });

  it('audits guardian access and account changes', async () => {
    const audit = await pool.query(
      "select action from audit_log where tenant_id = $1 and action like 'privacy.%' order by created_at",
      [TENANT_ID],
    );
    expect(audit.rows.map((row) => row.action)).toEqual([
      'privacy.guardian_access_updated',
      'privacy.guardian_access_updated',
      'privacy.guardian_created',
      'privacy.guardian_created',
      'privacy.guardian_access_updated',
      'privacy.guardian_created',
      'privacy.guardian_access_updated',
      'privacy.guardian_created',
      'privacy.notice_updated',
      'privacy.consent_recorded',
      'privacy.consent_recorded',
    ]);
  });
});
