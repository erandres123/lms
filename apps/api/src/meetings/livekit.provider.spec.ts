import type { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { decodeJwt, SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { LiveKitProvider } from './livekit.provider';

const API_KEY = 'test-key';
const API_SECRET = 'test-secret-that-is-long-enough-for-hs256';

function provider(overrides: Record<string, string | undefined> = {}): LiveKitProvider {
  const values: Record<string, string | undefined> = {
    LIVEKIT_URL: 'wss://example.livekit.cloud',
    LIVEKIT_API_KEY: API_KEY,
    LIVEKIT_API_SECRET: API_SECRET,
    ...overrides,
  };
  return new LiveKitProvider({ get: (key: string) => values[key] } as unknown as ConfigService);
}

async function webhookAuth(body: string): Promise<string> {
  const sha256 = createHash('sha256').update(body).digest('base64');
  return new SignJWT({ sha256 })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(API_KEY)
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(API_SECRET));
}

describe('LiveKitProvider', () => {
  it('reports configuration only when all three settings are present', () => {
    expect(provider().configured).toBe(true);
    expect(provider({ LIVEKIT_API_SECRET: undefined }).configured).toBe(false);
  });

  it('rejects joining when LiveKit is not configured', async () => {
    const unconfigured = provider({ LIVEKIT_URL: undefined });
    await expect(
      unconfigured.createJoinToken({
        identity: 'user-1',
        name: 'Teacher',
        role: 'moderator',
        appRole: 'teacher',
        roomName: 'lms.test',
        ttlSeconds: 3600,
        studentId: null,
      }),
    ).rejects.toThrow('live classes are not configured');
  });

  it('mints moderator tokens that can publish in the room', async () => {
    const token = await provider().createJoinToken({
      identity: '00000000-0000-4000-8000-000000000102',
      name: 'Ms. Cruz',
      role: 'moderator',
      appRole: 'teacher',
      roomName: 'lms.test.room',
      ttlSeconds: 3600,
      studentId: null,
    });

    const claims = decodeJwt(token);
    const video = claims.video as Record<string, unknown>;
    expect(claims.sub).toBe('00000000-0000-4000-8000-000000000102');
    expect(claims.iss).toBe(API_KEY);
    expect(video.room).toBe('lms.test.room');
    expect(video.roomJoin).toBe(true);
    expect(video.roomAdmin).toBe(true);
    expect(video.canPublish).toBe(true);
    expect(JSON.parse(claims.metadata as string)).toMatchObject({ appRole: 'teacher' });
  });

  it('mints viewer tokens that cannot publish media', async () => {
    const token = await provider().createJoinToken({
      identity: '00000000-0000-4000-8000-000000000103',
      name: 'Maria Santos',
      role: 'viewer',
      appRole: 'student',
      roomName: 'lms.test.room',
      ttlSeconds: 3600,
      studentId: '00000000-0000-4000-8000-000000000201',
    });

    const video = decodeJwt(token).video as Record<string, unknown>;
    expect(video.canPublish).toBe(false);
    expect(video.canSubscribe).toBe(true);
    expect(video.roomAdmin).toBeUndefined();
    expect(JSON.parse(decodeJwt(token).metadata as string)).toMatchObject({
      appRole: 'student',
      studentId: '00000000-0000-4000-8000-000000000201',
    });
  });

  it('accepts a correctly signed webhook and rejects a tampered body', async () => {
    const body = JSON.stringify({
      event: 'room_started',
      room: { name: 'lms.test.room' },
      id: 'EV_test',
      createdAt: 1763000000,
    });
    const auth = await webhookAuth(body);

    const event = await provider().verifyWebhook(body, auth);
    expect(event.event).toBe('room_started');
    expect(event.room?.name).toBe('lms.test.room');

    await expect(
      provider().verifyWebhook(body.replace('room_started', 'room_finished'), auth),
    ).rejects.toThrow();
  });

  it('rejects webhooks with the wrong signing key', async () => {
    const body = JSON.stringify({ event: 'room_started', room: { name: 'lms.test' } });
    const auth = await webhookAuth(body);
    const other = provider({ LIVEKIT_API_SECRET: 'a-different-secret-that-is-long-enough' });

    await expect(other.verifyWebhook(body, auth)).rejects.toThrow();
  });
});
