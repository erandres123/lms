import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RetentionService } from './retention.service';

const TICK_MS = 30 * 60 * 1000;

@Injectable()
export class RetentionScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(RetentionScheduler.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly retention: RetentionService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.get<string>('NODE_ENV') === 'test') return;
    if (this.config.get<string>('RETENTION_SCHEDULER') === 'off') return;

    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
    void this.tick();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    try {
      const ran = await this.retention.runScheduled();
      if (ran.length > 0) {
        this.logger.log(`Nightly retention dry run completed for ${ran.length} tenant(s)`);
      }
    } catch (error) {
      this.logger.warn(
        `Nightly retention dry run failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
