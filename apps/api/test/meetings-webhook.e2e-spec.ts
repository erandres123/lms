import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { SignJWT } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { DatabaseService } from '../src/database/database.service';

const apiKey = process.env.LIVEKIT_API_KEY;
const apiSecret = process.env.LIVEKIT_API_SECRET;
const suite = apiKey && apiSecret ? describe : describe.skip;

async function webhookAuth(body: string): Promise<string> {
  const sha256 = createHash('sha256').update(body).digest('base64');
  return new SignJWT({ sha256 })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(apiKey!)
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(apiSecret!));
}

suite('livekit webhook (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue({
        db: {
          select: () => ({
            from: () => ({
              where: () => ({ limit: async () => [] }),
            }),
          }),
        },
      })
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ rawBody: true });
    configureApp(app as NestExpressApplication);
    app.setGlobalPrefix('v1');
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('accepts a signed event sent as application/webhook+json', async () => {
    const body = JSON.stringify({
      event: 'room_started',
      room: { name: 'lms.00000000000000000000000000000000.unknown' },
      id: `EV_test_${Date.now()}`,
      createdAt: Math.floor(Date.now() / 1000),
    });

    await request(app.getHttpServer())
      .post('/v1/webhooks/livekit')
      .set('Content-Type', 'application/webhook+json')
      // LiveKit sends the bare JWT in Authorization; the SDK does not strip a scheme.
      .set('Authorization', await webhookAuth(body))
      .send(body)
      .serialize(() => body)
      .expect(200);
  });

  it('rejects an unsigned event', async () => {
    const body = JSON.stringify({ event: 'room_started', room: { name: 'x' } });
    await request(app.getHttpServer())
      .post('/v1/webhooks/livekit')
      .set('Content-Type', 'application/webhook+json')
      .send(body)
      .serialize(() => body)
      .expect(401);
  });
});
