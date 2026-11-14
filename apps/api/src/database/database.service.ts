import { tenantIdSchema } from '@lms/shared';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import { DATABASE_POOL } from './database.constants';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseService.name);
  readonly db: Database;

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {
    this.db = drizzle(pool, { schema });

    // Managed poolers (Supabase/Supavisor) reset idle connections; without a
    // listener pg emits an unhandled 'error' event and crashes the process.
    this.pool.on('error', (error: Error) => {
      this.logger.warn(`Idle database connection dropped: ${error.message}`);
    });
  }

  async ping(): Promise<void> {
    await this.pool.query('select 1');
  }

  /**
   * Runs a unit of work with the tenant GUC set for this transaction, so RLS
   * policies can key off app.tenant_id. All tenant-scoped writes go through here.
   */
  async withTenant<T>(tenantId: string, work: (tx: Database) => Promise<T>): Promise<T> {
    const id = tenantIdSchema.parse(tenantId);
    const client = await this.pool.connect();

    try {
      await client.query('begin');
      await client.query("select set_config('app.tenant_id', $1, true)", [id]);
      const result = await work(drizzle(client, { schema }));
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end().catch((error: unknown) => {
      this.logger.warn(`Failed to close the database pool: ${String(error)}`);
    });
  }
}
