import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SignJWT } from 'jose';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { RetentionService } from '../src/retention/retention.service';

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

const TENANT_ID = randomUUID();
const OTHER_TENANT_ID = randomUUID();
const ADMIN_ID = randomUUID();
const TEACHER_ID = randomUUID();
const SECTION_ID = randomUUID();
const MEETING_ID = randomUUID();
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET ?? 'test-only-secret-change-me-0123456789';

const POLICY = {
  runHour: 2,
  notificationsReadDays: 30,
  staleDeviceDays: 60,
  processedEventDays: 30,
  syncReceiptDays: 365,
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

suite('retention policy and nightly dry run (integration)', () => {
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
       values ($1, $2, 'Retention School'), ($3, $4, 'Retention Other School')`,
      [TENANT_ID, `retention-${suffix}`, OTHER_TENANT_ID, `retention-other-${suffix}`],
    );
    await pool.query(
      `insert into users (id, email, display_name)
       values ($1, $2, 'Retention Admin'), ($3, $4, 'Retention Teacher')`,
      [
        ADMIN_ID,
        `retention-admin-${suffix}@school.ph`,
        TEACHER_ID,
        `retention-teacher-${suffix}@school.ph`,
      ],
    );
    await pool.query(
      `insert into user_tenants (user_id, tenant_id, role)
       values ($1, $2, 'school_admin'), ($1, $3, 'school_admin'), ($4, $2, 'teacher')`,
      [ADMIN_ID, TENANT_ID, OTHER_TENANT_ID, TEACHER_ID],
    );

    await pool.query(
      `insert into sections (id, tenant_id, name, grade_level, school_year)
       values ($1, $2, 'Grade 8 - Retention', 8, '2026-2027')`,
      [SECTION_ID, TENANT_ID],
    );
    await pool.query(
      `insert into meetings (id, tenant_id, section_id, title, room_name, scheduled_for)
       values ($1, $2, $3, 'Retention meeting', $4, now() - interval '45 days')`,
      [MEETING_ID, TENANT_ID, SECTION_ID, `room-${suffix}`],
    );

    await pool.query(
      `insert into notifications (tenant_id, user_id, kind, title, body, dedupe_key, read_at, created_at)
       values
         ($1, $2, 'grade_posted', 'Old read', 'old', 'ret-old', now() - interval '40 days', now() - interval '50 days'),
         ($1, $2, 'grade_posted', 'New read', 'new', 'ret-new', now() - interval '2 days', now() - interval '3 days'),
         ($1, $2, 'grade_posted', 'Old unread', 'unread', 'ret-unread', null, now() - interval '50 days'),
         ($3, $2, 'grade_posted', 'Other read', 'other', 'ret-other', now() - interval '40 days', now() - interval '50 days')`,
      [TENANT_ID, ADMIN_ID, OTHER_TENANT_ID],
    );

    await pool.query(
      `insert into push_devices (tenant_id, user_id, platform, token, last_seen_at)
       values
         ($1, $2, 'web', $3, now() - interval '100 days'),
         ($1, $2, 'web', $4, now() - interval '1 day')`,
      [TENANT_ID, ADMIN_ID, `old-${suffix}`, `new-${suffix}`],
    );

    await pool.query(
      `insert into meeting_events (tenant_id, meeting_id, provider_event_id, type, occurred_at, processed_at)
       values
         ($1, $2, $3, 'participant_joined', now() - interval '45 days', now() - interval '45 days'),
         ($1, $2, $4, 'participant_joined', now() - interval '1 day', now() - interval '1 day')`,
      [TENANT_ID, MEETING_ID, `evt-old-${suffix}`, `evt-new-${suffix}`],
    );

    await pool.query(
      `insert into sync_operations (tenant_id, user_id, client_op_id, kind, status, created_at)
       values
         ($1, $2, $3, 'attendance', 'applied', now() - interval '400 days'),
         ($1, $2, $4, 'attendance', 'applied', now() - interval '1 day')`,
      [TENANT_ID, ADMIN_ID, randomUUID(), randomUUID()],
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

  it('reads an empty policy until an admin sets one', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/retention')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body.settings.version).toBe(0);
    expect(response.body.settings.updatedAt).toBeNull();
    expect(response.body.settings.policy).toEqual({
      runHour: 2,
      notificationsReadDays: null,
      staleDeviceDays: null,
      processedEventDays: null,
      syncReceiptDays: null,
    });
    expect(response.body.runs).toEqual([]);
  });

  it('rejects teachers and invalid retention windows', async () => {
    await request(app.getHttpServer())
      .get('/v1/retention')
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .put('/v1/retention')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ policy: { ...POLICY, notificationsReadDays: 0 }, version: 0 })
      .expect(400);
  });

  it('stores the policy with optimistic versioning', async () => {
    const saved = await request(app.getHttpServer())
      .put('/v1/retention')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ policy: POLICY, version: 0 })
      .expect(200);

    expect(saved.body).toMatchObject({ policy: POLICY, version: 1 });
    expect(saved.body.updatedAt).not.toBeNull();

    await request(app.getHttpServer())
      .put('/v1/retention')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ policy: POLICY, version: 0 })
      .expect(409);
  });

  it('counts what would be removed and deletes nothing', async () => {
    const run = await request(app.getHttpServer())
      .post('/v1/retention/dry-run')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    expect(run.body).toMatchObject({ mode: 'dry_run', triggeredBy: 'manual', totalRows: 4 });
    const rows = Object.fromEntries(
      (run.body.categories as Array<{ key: string; rows: number; enabled: boolean }>).map(
        (category) => [category.key, category.rows],
      ),
    );
    expect(rows).toEqual({
      notificationsReadDays: 1,
      staleDeviceDays: 1,
      processedEventDays: 1,
      syncReceiptDays: 1,
    });
    expect(
      (run.body.categories as Array<{ cutoff: string | null }>).every(
        (category) => category.cutoff !== null,
      ),
    ).toBe(true);

    const notifications = await pool.query(
      'select count(*)::int as total from notifications where tenant_id = $1',
      [TENANT_ID],
    );
    expect(notifications.rows[0].total).toBe(3);
    const devices = await pool.query(
      'select count(*)::int as total from push_devices where tenant_id = $1',
      [TENANT_ID],
    );
    expect(devices.rows[0].total).toBe(2);
    const receipts = await pool.query(
      'select count(*)::int as total from sync_operations where tenant_id = $1',
      [TENANT_ID],
    );
    expect(receipts.rows[0].total).toBe(2);

    const audit = await pool.query(
      'select action from audit_log where tenant_id = $1 order by created_at',
      [TENANT_ID],
    );
    expect(audit.rows.map((row) => row.action)).toEqual([
      'retention.policy_updated',
      'retention.dry_run',
    ]);
  });

  it('keeps each tenant to its own rows and runs', async () => {
    await request(app.getHttpServer())
      .put('/v1/retention')
      .set('Authorization', `Bearer ${otherTenantToken}`)
      .send({ policy: { ...POLICY, staleDeviceDays: null }, version: 0 })
      .expect(200);

    const run = await request(app.getHttpServer())
      .post('/v1/retention/dry-run')
      .set('Authorization', `Bearer ${otherTenantToken}`)
      .expect(201);

    expect(run.body.totalRows).toBe(1);
    expect(run.body.categories[0]).toMatchObject({ key: 'notificationsReadDays', rows: 1 });

    const overview = await request(app.getHttpServer())
      .get('/v1/retention')
      .set('Authorization', `Bearer ${otherTenantToken}`)
      .expect(200);
    expect(overview.body.runs).toHaveLength(1);
  });

  it('runs the nightly pass at most once per tenant-local day', async () => {
    const retention = app.get(RetentionService);
    const now = new Date('2026-01-15T19:30:00Z'); // 03:30 on 2026-01-16 in Manila

    const first = await retention.runScheduled(now);
    expect(first.sort()).toEqual([TENANT_ID, OTHER_TENANT_ID].sort());

    const second = await retention.runScheduled(now);
    expect(second).toEqual([]);

    const overview = await request(app.getHttpServer())
      .get('/v1/retention')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const scheduled = (overview.body.runs as Array<{ triggeredBy: string }>).filter(
      (run) => run.triggeredBy === 'schedule',
    );
    expect(scheduled).toHaveLength(1);
  });
});
