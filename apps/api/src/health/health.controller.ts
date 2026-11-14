import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../auth/auth.decorators';
import { DatabaseService } from '../database/database.service';

@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  check() {
    return {
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('db')
  async checkDatabase() {
    try {
      await this.database.ping();
      return { status: 'ok', dependency: 'postgres' };
    } catch {
      throw new ServiceUnavailableException('database unavailable');
    }
  }
}
