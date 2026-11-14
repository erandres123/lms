import type { PushPlatform } from '@lms/shared';

export interface PushMessage {
  token: string;
  platform: PushPlatform;
  title: string;
  body: string;
  data: Record<string, string>;
}

export type PushResult =
  | { ok: true }
  | { ok: false; permanent: boolean; error: string };

export interface PushSender {
  readonly configured: boolean;
  send(message: PushMessage): Promise<PushResult>;
}

export const PUSH_SENDER = Symbol('PUSH_SENDER');
