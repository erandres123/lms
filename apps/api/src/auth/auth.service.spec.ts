import type { ConfigService } from '@nestjs/config';
import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { AuthService } from './auth.service';

const TEST_SECRET = 'test-only-secret-change-me-0123456789';
const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

function createService(config: Record<string, string> = {}): AuthService {
  const fakeConfig = {
    get: (key: string, fallback?: string) => config[key] ?? fallback,
  };
  return new AuthService(fakeConfig as unknown as ConfigService);
}

async function signToken(
  overrides: Record<string, unknown> = {},
  options: { secret?: string; expiresAt?: number } = {},
): Promise<string> {
  const payload = {
    tenant_id: TENANT_ID,
    app_role: 'teacher',
    email: 'teacher@school.ph',
    ...overrides,
  };

  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(USER_ID)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime(options.expiresAt ?? Math.floor(Date.now() / 1000) + 300)
    .sign(new TextEncoder().encode(options.secret ?? TEST_SECRET));
}

function serviceWithSecret(): AuthService {
  return createService({
    SUPABASE_JWT_SECRET: TEST_SECRET,
    SUPABASE_JWT_AUDIENCE: 'authenticated',
  });
}

describe('AuthService', () => {
  it('maps a valid token to an AuthUser', async () => {
    const token = await signToken();

    await expect(serviceWithSecret().verifyAccessToken(token)).resolves.toEqual({
      userId: USER_ID,
      email: 'teacher@school.ph',
      tenantId: TENANT_ID,
      role: 'teacher',
    });
  });

  it('rejects an expired token', async () => {
    const token = await signToken({}, { expiresAt: Math.floor(Date.now() / 1000) - 60 });

    await expect(serviceWithSecret().verifyAccessToken(token)).rejects.toThrow(
      /invalid or expired token/,
    );
  });

  it('rejects a token signed with another secret', async () => {
    const token = await signToken({}, { secret: 'another-secret-at-least-32-characters-long' });

    await expect(serviceWithSecret().verifyAccessToken(token)).rejects.toThrow(
      /invalid or expired token/,
    );
  });

  it('rejects a token without tenant claims', async () => {
    const token = await signToken({ tenant_id: undefined });

    await expect(serviceWithSecret().verifyAccessToken(token)).rejects.toThrow(
      /missing tenant claims/,
    );
  });

  it('rejects a token whose app_role is not a platform role', async () => {
    const token = await signToken({ app_role: 'authenticated' });

    await expect(serviceWithSecret().verifyAccessToken(token)).rejects.toThrow(
      /missing tenant claims/,
    );
  });

  it('rejects everything when auth is not configured', async () => {
    const token = await signToken();

    await expect(createService().verifyAccessToken(token)).rejects.toThrow(/not configured/);
  });
});
