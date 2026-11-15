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

suite('audit log (integration)', () => {
  let app: INestApplication;
  let pool: Pool;
  let adminToken: string;
  let teacherToken: string;
  let otherTenantToken: string;
  let sectionId: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    const suffix = TENANT_ID.slice(0, 8);

    await pool.query(
      `insert into tenants (id, slug, name)
       values ($1, $2, 'Audit School'), ($3, $4, 'Other School')`,
      [TENANT_ID, `audit-${suffix}`, OTHER_TENANT_ID, `audit-other-${suffix}`],
    );

    await pool.query(
      `insert into users (id, email, display_name)
       values ($1, $2, 'Audit Admin'), ($3, $4, 'Audit Teacher')`,
      [
        ADMIN_ID,
        `audit-admin-${suffix}@school.ph`,
        TEACHER_ID,
        `audit-teacher-${suffix}@school.ph`,
      ],
    );

    await pool.query(
      `insert into user_tenants (user_id, tenant_id, role)
       values ($1, $2, 'school_admin'), ($1, $3, 'school_admin'), ($4, $2, 'teacher')`,
      [ADMIN_ID, TENANT_ID, OTHER_TENANT_ID, TEACHER_ID],
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

  it('lists the tenant audit trail for admins and hides other tenants', async () => {
    const server = app.getHttpServer();

    for (const name of ['Grade 7 - Rizal', 'Grade 7 - Mabini', 'Grade 8 - Rizal']) {
      const created = await request(server)
        .post('/v1/sections')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name, gradeLevel: 7, schoolYear: '2026-2027' })
        .expect(201);
      sectionId = created.body.id as string;
    }

    await request(server)
      .get('/v1/audit')
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(403);

    const firstPage = await request(server)
      .get('/v1/audit?limit=2')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(firstPage.body.timeZone).toBe('Asia/Manila');
    expect(firstPage.body.entries).toHaveLength(2);
    expect(firstPage.body.entries[0]).toMatchObject({
      action: 'section.created',
      entity: 'section',
      actorEmail: expect.stringContaining('audit-admin-'),
    });
    expect(firstPage.body.nextCursor).toBeTruthy();

    const secondPage = await request(server)
      .get(`/v1/audit?limit=2&cursor=${encodeURIComponent(firstPage.body.nextCursor)}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(secondPage.body.entries).toHaveLength(1);
    expect(secondPage.body.nextCursor).toBeNull();

    const byAction = await request(server)
      .get('/v1/audit?action=section.created')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(byAction.body.entries).toHaveLength(3);

    const wrongAction = await request(server)
      .get('/v1/audit?action=attendance.saved')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(wrongAction.body.entries).toHaveLength(0);

    const today = await request(server)
      .get(`/v1/audit?from=${todayInManila()}&to=${todayInManila()}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(today.body.entries).toHaveLength(3);

    const past = await request(server)
      .get('/v1/audit?to=2000-01-01')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(past.body.entries).toHaveLength(0);

    const otherTenant = await request(server)
      .get('/v1/audit')
      .set('Authorization', `Bearer ${otherTenantToken}`)
      .expect(200);
    expect(otherTenant.body.entries).toHaveLength(0);

    const byEntity = await request(server)
      .get(`/v1/audit?entity=section&entityId=${sectionId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(byEntity.body.entries).toHaveLength(1);

    await request(server)
      .get('/v1/audit?cursor=not-a-cursor')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });
});
