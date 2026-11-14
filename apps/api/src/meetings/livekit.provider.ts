import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccessToken,
  RoomServiceClient,
  WebhookReceiver,
  type WebhookEvent,
} from 'livekit-server-sdk';
import type { MeetingRole } from './meeting-policy';

export interface JoinTokenInput {
  identity: string;
  name: string;
  role: MeetingRole;
  appRole: string;
  roomName: string;
  ttlSeconds: number;
  studentId: string | null;
}

@Injectable()
export class LiveKitProvider {
  private readonly logger = new Logger(LiveKitProvider.name);
  private readonly url?: string;
  private readonly apiKey?: string;
  private readonly apiSecret?: string;

  constructor(config: ConfigService) {
    this.url = config.get<string>('LIVEKIT_URL');
    this.apiKey = config.get<string>('LIVEKIT_API_KEY');
    this.apiSecret = config.get<string>('LIVEKIT_API_SECRET');
  }

  get configured(): boolean {
    return Boolean(this.url && this.apiKey && this.apiSecret);
  }

  get publicUrl(): string {
    return this.requireConfig().url;
  }

  async createJoinToken(input: JoinTokenInput): Promise<string> {
    const { apiKey, apiSecret } = this.requireConfig();
    const token = new AccessToken(apiKey, apiSecret, {
      identity: input.identity,
      name: input.name,
      ttl: input.ttlSeconds,
      metadata: JSON.stringify({
        role: input.role,
        appRole: input.appRole,
        ...(input.studentId ? { studentId: input.studentId } : {}),
      }),
    });

    // Students join as viewers: they can hear and receive data, but only
    // moderators publish audio/video.
    token.addGrant({
      roomJoin: true,
      room: input.roomName,
      canSubscribe: true,
      canPublishData: true,
      canPublish: input.role === 'moderator',
      ...(input.role === 'moderator' ? { roomAdmin: true } : {}),
    });

    return token.toJwt();
  }

  async deleteRoom(roomName: string): Promise<void> {
    if (!this.configured) return;
    const { url, apiKey, apiSecret } = this.requireConfig();
    try {
      await new RoomServiceClient(url, apiKey, apiSecret).deleteRoom(roomName);
    } catch (error: unknown) {
      this.logger.warn(`Could not delete LiveKit room ${roomName}: ${String(error)}`);
    }
  }

  verifyWebhook(body: string, authHeader?: string): Promise<WebhookEvent> {
    const { apiKey, apiSecret } = this.requireConfig();
    return new WebhookReceiver(apiKey, apiSecret).receive(body, authHeader);
  }

  private requireConfig(): { url: string; apiKey: string; apiSecret: string } {
    if (!this.url || !this.apiKey || !this.apiSecret) {
      throw new ServiceUnavailableException('live classes are not configured');
    }
    return { url: this.url, apiKey: this.apiKey, apiSecret: this.apiSecret };
  }
}
