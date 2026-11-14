import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { FcmPushSender, isPermanentSendError } from './fcm-push-sender';

function configWith(path: string | undefined): ConfigService {
  return { get: () => path } as unknown as ConfigService;
}

const message = {
  token: 'test-token',
  platform: 'android' as const,
  title: 'Title',
  body: 'Body',
  data: { kind: 'grade_posted' },
};

describe('isPermanentSendError', () => {
  it('treats dead device tokens as permanent', () => {
    expect(isPermanentSendError('messaging/registration-token-not-registered')).toBe(true);
    expect(isPermanentSendError('messaging/invalid-registration-token')).toBe(true);
    expect(isPermanentSendError('messaging/invalid-recipient')).toBe(true);
    expect(isPermanentSendError('messaging/unregistered')).toBe(true);
  });

  it('treats a malformed device token as permanent', () => {
    expect(
      isPermanentSendError(
        'messaging/invalid-argument',
        'The registration token is not a valid FCM registration token',
      ),
    ).toBe(true);
    expect(isPermanentSendError('messaging/invalid-argument', 'data must be a string map')).toBe(
      false,
    );
  });

  it('keeps transient and configuration errors retryable', () => {
    expect(isPermanentSendError('messaging/internal-error')).toBe(false);
    expect(isPermanentSendError('messaging/server-unavailable')).toBe(false);
    expect(isPermanentSendError('messaging/third-party-auth-error')).toBe(false);
    expect(isPermanentSendError('')).toBe(false);
  });
});

describe('FcmPushSender', () => {
  it('stays disabled without a service-account path', async () => {
    const sender = new FcmPushSender(configWith(undefined));

    expect(sender.configured).toBe(false);
    await expect(sender.send(message)).resolves.toEqual({
      ok: false,
      permanent: false,
      error: 'push provider not configured',
    });
  });

  it('stays disabled when the key file cannot be loaded', async () => {
    const sender = new FcmPushSender(configWith('./does-not-exist.json'));

    expect(sender.configured).toBe(false);
  });
});
