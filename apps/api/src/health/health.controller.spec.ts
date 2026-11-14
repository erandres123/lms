import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from '../database/database.service';
import { HealthController } from './health.controller';

function createController(ping: ReturnType<typeof vi.fn>) {
  return new HealthController({ ping } as unknown as DatabaseService);
}

describe('HealthController', () => {
  it('reports ok with uptime', () => {
    const controller = createController(vi.fn());

    const result = controller.check();

    expect(result.status).toBe('ok');
    expect(result.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('reports the database dependency as ok', async () => {
    const ping = vi.fn().mockResolvedValue(undefined);

    await expect(createController(ping).checkDatabase()).resolves.toEqual({
      status: 'ok',
      dependency: 'postgres',
    });
  });

  it('returns 503 semantics when the database is unreachable', async () => {
    const ping = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED'));

    await expect(createController(ping).checkDatabase()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
