import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';
import type { WebhookEvent } from 'livekit-server-sdk';
import { Public } from '../auth/auth.decorators';
import { LiveKitProvider } from './livekit.provider';
import { MeetingsService } from './meetings.service';

@Controller('webhooks/livekit')
export class LiveKitWebhookController {
  constructor(
    private readonly livekit: LiveKitProvider,
    private readonly meetings: MeetingsService,
  ) {}

  @Post()
  @Public()
  @HttpCode(200)
  async receive(
    @Req() request: RawBodyRequest<Request>,
    @Headers('authorization') authorization?: string,
  ) {
    if (!this.livekit.configured) {
      throw new ServiceUnavailableException('live classes are not configured');
    }
    if (!request.rawBody) {
      throw new BadRequestException('raw request body is required');
    }

    let event: WebhookEvent;
    try {
      event = await this.livekit.verifyWebhook(request.rawBody.toString('utf8'), authorization);
    } catch {
      throw new UnauthorizedException('invalid webhook signature');
    }

    await this.meetings.handleWebhook(event);
    return { ok: true };
  }
}
