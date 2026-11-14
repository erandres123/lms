import { z } from 'zod';

const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    DATABASE_URL: z.string().min(1),
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:3000')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),
    LOG_LEVEL: z.enum(['error', 'warn', 'log', 'debug', 'verbose']).default('log'),
    SUPABASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
    SUPABASE_JWT_SECRET: z.preprocess(emptyToUndefined, z.string().min(32).optional()),
    SUPABASE_JWT_AUDIENCE: z.string().min(1).default('authenticated'),
    LIVEKIT_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
    LIVEKIT_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    LIVEKIT_API_SECRET: z.preprocess(emptyToUndefined, z.string().min(32).optional()),
    FIREBASE_SERVICE_ACCOUNT_PATH: z.preprocess(
      emptyToUndefined,
      z.string().min(1).optional(),
    ),
  })
  .refine(
    (env) => env.NODE_ENV !== 'production' || Boolean(env.SUPABASE_URL ?? env.SUPABASE_JWT_SECRET),
    {
      message: 'SUPABASE_URL or SUPABASE_JWT_SECRET is required in production',
      path: ['SUPABASE_URL'],
    },
  )
  .refine(
    (env) => {
      const parts = [env.LIVEKIT_URL, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET];
      return parts.every(Boolean) || parts.every((part) => !part);
    },
    {
      message: 'LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set together',
      path: ['LIVEKIT_URL'],
    },
  );

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }

  return parsed.data;
}
