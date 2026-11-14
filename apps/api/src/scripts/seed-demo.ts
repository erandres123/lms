import { Pool } from 'pg';
import { sslOptions } from '../database/ssl-options';
import { requireDevEnv, signDevToken } from './dev-auth';

const IDS = {
  tenant: '00000000-0000-4000-8000-000000000001',
  admin: '00000000-0000-4000-8000-000000000101',
  teacher: '00000000-0000-4000-8000-000000000102',
  studentUser: '00000000-0000-4000-8000-000000000103',
  maria: '00000000-0000-4000-8000-000000000201',
  jose: '00000000-0000-4000-8000-000000000202',
  ana: '00000000-0000-4000-8000-000000000203',
  section: '00000000-0000-4000-8000-000000000301',
  period: '00000000-0000-4000-8000-000000000401',
  written: '00000000-0000-4000-8000-000000000501',
  performance: '00000000-0000-4000-8000-000000000502',
  quiz1: '00000000-0000-4000-8000-000000000601',
  quiz2: '00000000-0000-4000-8000-000000000602',
  task1: '00000000-0000-4000-8000-000000000603',
};

async function main(): Promise<void> {
  const { secret } = requireDevEnv();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');

  const target = new URL(connectionString);
  console.log(`Seeding ${target.hostname}${target.pathname} as ${target.username}`);

  const pool = new Pool({
    connectionString,
    ...sslOptions(process.env.DATABASE_SSL_CA),
    application_name: 'lms-demo-seed',
  });
  const client = await pool.connect();

  try {
    await client.query('begin');

    await client.query(
      `insert into tenants (id, slug, name)
       values ($1, 'demo-academy', 'Demo Academy')
       on conflict (id) do update set name = excluded.name`,
      [IDS.tenant],
    );

    await client.query(
      `insert into users (id, email, display_name) values
         ($1, 'admin@demo.ph', 'Demo Admin'),
         ($2, 'teacher@demo.ph', 'Ms. Cruz'),
         ($3, 'student@demo.ph', 'Maria Santos')
       on conflict (id) do update
         set email = excluded.email, display_name = excluded.display_name`,
      [IDS.admin, IDS.teacher, IDS.studentUser],
    );

    await client.query(
      `insert into user_tenants (user_id, tenant_id, role) values
         ($1, $4, 'school_admin'),
         ($2, $4, 'teacher'),
         ($3, $4, 'student')
       on conflict (user_id, tenant_id) do update set role = excluded.role`,
      [IDS.admin, IDS.teacher, IDS.studentUser, IDS.tenant],
    );

    await client.query(
      `insert into sections (id, tenant_id, name, grade_level, school_year, teacher_id)
       values ($1, $2, 'Grade 7 - Rizal', 7, '2026-2027', $3)
       on conflict (id) do update
         set name = excluded.name, teacher_id = excluded.teacher_id`,
      [IDS.section, IDS.tenant, IDS.teacher],
    );

    await client.query(
      `insert into students (id, tenant_id, user_id, first_name, last_name, lrn) values
         ($1, $4, $5, 'Maria', 'Santos', '123456789012'),
         ($2, $4, null, 'Jose', 'Reyes', '123456789013'),
         ($3, $4, null, 'Ana', 'Cruz', '123456789014')
       on conflict (id) do update
         set first_name = excluded.first_name,
             last_name = excluded.last_name,
             user_id = excluded.user_id`,
      [IDS.maria, IDS.jose, IDS.ana, IDS.tenant, IDS.studentUser],
    );

    await client.query(
      `insert into enrollments (tenant_id, section_id, student_id) values
         ($1, $2, $3), ($1, $2, $4), ($1, $2, $5)
       on conflict (section_id, student_id) do nothing`,
      [IDS.tenant, IDS.section, IDS.maria, IDS.jose, IDS.ana],
    );

    await client.query(
      `insert into grading_periods (id, tenant_id, name, school_year, sequence)
       values ($1, $2, 'Quarter 1', '2026-2027', 1)
       on conflict (id) do update set name = excluded.name`,
      [IDS.period, IDS.tenant],
    );

    await client.query(
      `insert into grade_categories (id, tenant_id, section_id, period_id, name, weight, sequence)
       values ($1, $3, $4, $5, 'Written Work', 60, 1),
              ($2, $3, $4, $5, 'Performance Task', 40, 2)
       on conflict (id) do update
         set name = excluded.name, weight = excluded.weight, sequence = excluded.sequence`,
      [IDS.written, IDS.performance, IDS.tenant, IDS.section, IDS.period],
    );

    await client.query(
      `insert into grade_items
         (id, tenant_id, section_id, period_id, category_id, title, max_score, competency_code)
       values
         ($1, $4, $5, $6, $7, 'Quiz 1', 100, 'M7NS-Ia-1'),
         ($2, $4, $5, $6, $7, 'Quiz 2', 50, 'M7NS-Ia-2'),
         ($3, $4, $5, $6, $8, 'Performance Task 1', 100, 'M7NS-Ib-1')
       on conflict (id) do update
         set title = excluded.title, max_score = excluded.max_score`,
      [
        IDS.quiz1,
        IDS.quiz2,
        IDS.task1,
        IDS.tenant,
        IDS.section,
        IDS.period,
        IDS.written,
        IDS.performance,
      ],
    );

    await client.query(
      `insert into grades (tenant_id, item_id, student_id, score, entered_by) values
         ($1, $2, $5, 90, $8), ($1, $2, $6, 80, $8), ($1, $2, $7, 95, $8),
         ($1, $3, $5, 40, $8), ($1, $3, $6, 30, $8), ($1, $3, $7, 45, $8),
         ($1, $4, $5, 80, $8), ($1, $4, $6, 70, $8), ($1, $4, $7, 90, $8)
       on conflict (item_id, student_id) do update set score = excluded.score`,
      [
        IDS.tenant,
        IDS.quiz1,
        IDS.quiz2,
        IDS.task1,
        IDS.maria,
        IDS.jose,
        IDS.ana,
        IDS.teacher,
      ],
    );

    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }

  const adminToken = await signDevToken({
    userId: IDS.admin,
    tenantId: IDS.tenant,
    role: 'school_admin',
    email: 'admin@demo.ph',
    secret,
  });
  const teacherToken = await signDevToken({
    userId: IDS.teacher,
    tenantId: IDS.tenant,
    role: 'teacher',
    email: 'teacher@demo.ph',
    secret,
  });
  const studentToken = await signDevToken({
    userId: IDS.studentUser,
    tenantId: IDS.tenant,
    role: 'student',
    email: 'student@demo.ph',
    secret,
  });

  console.log('Demo Academy seeded.');
  console.log(`tenant_id: ${IDS.tenant}`);
  console.log(`\nADMIN TOKEN\n${adminToken}`);
  console.log(`\nTEACHER TOKEN\n${teacherToken}`);
  console.log(`\nSTUDENT TOKEN\n${studentToken}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
