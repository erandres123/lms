import { parseArgs } from 'node:util';
import { userRoleSchema } from '@lms/shared';
import { z } from 'zod';
import { requireDevEnv, signDevToken } from './dev-auth';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      'user-id': { type: 'string' },
      'tenant-id': { type: 'string' },
      role: { type: 'string', default: 'teacher' },
      email: { type: 'string', default: 'user@example.ph' },
    },
    strict: true,
  });

  const schema = z.object({
    'user-id': z.uuid(),
    'tenant-id': z.uuid(),
    role: userRoleSchema,
    email: z.email(),
  });
  const parsed = schema.safeParse(values);

  if (!parsed.success) {
    console.error(
      'Usage: pnpm --filter @lms/api dev:token --user-id <uuid> --tenant-id <uuid> [--role teacher] [--email a@b.ph]',
    );
    process.exitCode = 1;
    return;
  }

  const { secret } = requireDevEnv();
  const token = await signDevToken({
    userId: parsed.data['user-id'],
    tenantId: parsed.data['tenant-id'],
    role: parsed.data.role,
    email: parsed.data.email,
    secret,
  });

  console.log(token);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
