import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';
import type { PushMessage, PushResult, PushSender } from './push-sender';

interface ServiceAccountJson {
  project_id?: string;
  client_email?: string;
  private_key?: string;
}

const APP_NAME = 'lms-push';
const PERMANENT_CODES = new Set([
  'registration-token-not-registered',
  'invalid-registration-token',
  'invalid-recipient',
  'unregistered',
]);

export function isPermanentSendError(code: string, detail = ''): boolean {
  const normalized = code.replace(/^messaging\//, '');
  if (PERMANENT_CODES.has(normalized)) return true;
  // FCM reports a malformed device token as invalid-argument; the same code
  // also covers bad payloads, which must not delete a real device row.
  return normalized === 'invalid-argument' && /registration token/i.test(detail);
}

function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return String((error as { code: unknown }).code);
  }
  return '';
}

@Injectable()
export class FcmPushSender implements PushSender {
  private readonly logger = new Logger(FcmPushSender.name);
  private readonly messaging: Messaging | null;

  constructor(config: ConfigService) {
    this.messaging = this.createMessaging(
      config.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH'),
    );
  }

  get configured(): boolean {
    return this.messaging !== null;
  }

  async send(message: PushMessage): Promise<PushResult> {
    if (!this.messaging) {
      return { ok: false, permanent: false, error: 'push provider not configured' };
    }

    try {
      await this.messaging.send({
        token: message.token,
        notification: { title: message.title, body: message.body },
        data: message.data,
        android: { priority: 'high' },
      });
      return { ok: true };
    } catch (error) {
      const code = errorCode(error);
      const detail = error instanceof Error ? error.message : String(error);
      const permanent = isPermanentSendError(code, detail);
      if (permanent) {
        this.logger.warn(`FCM rejected device token (${code || 'unknown'}): ${detail}`);
      } else {
        this.logger.warn(`FCM send failed (${code || 'unknown'}): ${detail}`);
      }
      return {
        ok: false,
        permanent,
        error: code ? `${code}: ${detail}` : detail,
      };
    }
  }

  private createMessaging(path?: string): Messaging | null {
    if (!path) {
      this.logger.log('FCM disabled: FIREBASE_SERVICE_ACCOUNT_PATH is not set');
      return null;
    }

    try {
      const account = JSON.parse(
        readFileSync(resolve(path), 'utf8'),
      ) as ServiceAccountJson;

      if (!account.project_id || !account.client_email || !account.private_key) {
        throw new Error('service account JSON is missing project_id, client_email or private_key');
      }

      const existing = getApps().find((app) => app.name === APP_NAME);
      const app =
        existing ??
        initializeApp(
          {
            credential: cert({
              projectId: account.project_id,
              clientEmail: account.client_email,
              privateKey: account.private_key,
            }),
            projectId: account.project_id,
          },
          APP_NAME,
        );

      this.logger.log(`FCM enabled for project ${account.project_id}`);
      return getMessaging(app);
    } catch (error) {
      // Keep the API booting; inbox rows still land and delivery is marked skipped.
      this.logger.error(
        `FCM disabled: could not load service account at ${path}: ${String(error)}`,
      );
      return null;
    }
  }
}
