import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SignJWT } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

async function signToken(claims: Record<string, unknown> = {}): Promise<string> {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) throw new Error('SUPABASE_JWT_SECRET must be set for e2e tests');

  return new SignJWT({
    tenant_id: TENANT_ID,
    app_role: 'teacher',
    email: 'teacher@school.ph',
    ...claims,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(USER_ID)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(secret));
}

describe('me (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects a request without a bearer token', async () => {
    await request(app.getHttpServer()).get('/v1/me').expect(401);
  });

  it('returns the tenant claims for a valid token', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/me')
      .set('Authorization', `Bearer ${await signToken()}`)
      .expect(200);

    expect(response.body).toEqual({
      userId: USER_ID,
      email: 'teacher@school.ph',
      tenantId: TENANT_ID,
      role: 'teacher',
    });
  });

  it('rejects a token without tenant claims', async () => {
    await request(app.getHttpServer())
      .get('/v1/me')
      .set('Authorization', `Bearer ${await signToken({ tenant_id: undefined })}`)
      .expect(401);
  });
});
