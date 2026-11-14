import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';

const SWEEP_INTERVAL_MS = 60_000;

@Injectable()
export class ClassStartScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ClassStartScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly notifications: NotificationsService) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    this.timer.unref();
    void this.sweep();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async sweep(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      const created = await this.notifications.sweepClassStarting();
      if (created > 0) {
        this.logger.log(`Queued ${created} class-starting notification(s)`);
      }
    } catch (error) {
      this.logger.warn(`Class-starting sweep failed: ${String(error)}`);
    } finally {
      this.running = false;
    }
  }
}
