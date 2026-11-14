import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { userRoleSchema } from '@lms/shared';
import { Pool } from 'pg';
import { z } from 'zod';
import { sslOptions } from '../database/ssl-options';

try {
  process.loadEnvFile();
} catch {
  // .env is optional when the environment is already populated
}

const inputSchema = z.object({
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'use lowercase letters, digits, and hyphens'),
  name: z.string().min(2),
  'admin-user-id': z.uuid(),
  'admin-email': z.email(),
  'admin-name': z.string().min(1).optional(),
  timezone: z.string().min(1).default('Asia/Manila'),
  role: userRoleSchema.default('school_admin'),
});

const usage = `Usage:
  pnpm provision:tenant --slug <slug> --name <school name> \\
    --admin-user-id <supabase user uuid> --admin-email <email> \\
    [--admin-name <name>] [--timezone Asia/Manila] [--role school_admin]`;

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      slug: { type: 'string' },
      name: { type: 'string' },
      'admin-user-id': { type: 'string' },
      'admin-email': { type: 'string' },
      'admin-name': { type: 'string' },
      timezone: { type: 'string', default: 'Asia/Manila' },
      role: { type: 'string', default: 'school_admin' },
    },
    strict: true,
  });

  const parsed = inputSchema.safeParse(values);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    console.error(`Invalid arguments:\n${issues}\n\n${usage}`);
    process.exitCode = 1;
    return;
  }

  const input = parsed.data;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is required (use the migration/admin role, not the API role).');
    process.exitCode = 1;
    return;
  }

  const pool = new Pool({
    connectionString,
    ...sslOptions(process.env.DATABASE_SSL_CA),
    application_name: 'lms-provision',
  });
  const client = await pool.connect();

  try {
    await client.query('begin');

    const tenantId = randomUUID();
    const tenant = await client.query<{ id: string }>(
      `insert into tenants (id, slug, name, timezone)
       values ($1, $2, $3, $4)
       on conflict (slug) do update
         set name = excluded.name, timezone = excluded.timezone
       returning id`,
      [tenantId, input.slug, input.name, input.timezone],
    );
    const resolvedTenantId = tenant.rows[0]?.id;
    if (!resolvedTenantId) throw new Error('failed to upsert tenant');

    await client.query("select set_config('app.tenant_id', $1, true)", [resolvedTenantId]);

    await client.query(
      `insert into users (id, email, display_name)
       values ($1, $2, $3)
       on conflict (id) do update
         set email = excluded.email,
             display_name = coalesce(excluded.display_name, users.display_name)`,
      [input['admin-user-id'], input['admin-email'], input['admin-name'] ?? null],
    );

    await client.query(
      `insert into user_tenants (user_id, tenant_id, role)
       values ($1, $2, $3)
       on conflict (user_id, tenant_id) do update set role = excluded.role`,
      [input['admin-user-id'], resolvedTenantId, input.role],
    );

    await client.query(
      `insert into audit_log (tenant_id, actor_id, action, entity, entity_id, metadata)
       values ($1, null, 'tenant.provisioned', 'tenant', $2, $3::jsonb)`,
      [resolvedTenantId, resolvedTenantId, JSON.stringify({ slug: input.slug })],
    );

    await client.query('commit');

    console.log(`Tenant ready: ${input.name} (${input.slug})`);
    console.log(`  tenant_id: ${resolvedTenantId}`);
    console.log(`  admin:     ${input['admin-email']} (${input['admin-user-id']}) role=${input.role}`);
    console.log(
      'Next: set tenant_id and app_role in the Supabase custom access token hook for this user.',
    );
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
