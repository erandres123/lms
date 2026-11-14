import { userRoleSchema } from '@lms/shared';
import { SignJWT } from 'jose';
import { z } from 'zod';

const signInputSchema = z.object({
  userId: z.uuid(),
  tenantId: z.uuid(),
  role: userRoleSchema,
  email: z.email(),
  secret: z.string().min(32),
});

export type SignDevTokenInput = z.input<typeof signInputSchema> & { expiresIn?: string };

export async function signDevToken(input: SignDevTokenInput): Promise<string> {
  const parsed = signInputSchema.parse(input);

  return new SignJWT({
    tenant_id: parsed.tenantId,
    app_role: parsed.role,
    email: parsed.email,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(parsed.userId)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime(input.expiresIn ?? '12h')
    .sign(new TextEncoder().encode(parsed.secret));
}

export function requireDevEnv(): { secret: string } {
  try {
    process.loadEnvFile();
  } catch {
    // env may already be populated
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('dev auth helpers are disabled in production');
  }

  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SUPABASE_JWT_SECRET (min 32 chars) is required');
  }

  return { secret };
}
