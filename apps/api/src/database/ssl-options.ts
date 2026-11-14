import { readFileSync } from 'node:fs';
import type { PoolConfig } from 'pg';

/**
 * Supabase poolers present a chain anchored at "Supabase Root 2021 CA", which
 * is not in the system trust store. DATABASE_SSL_CA points at that public root
 * so TLS is both encrypted and verified.
 */
export function sslOptions(caPath: string | undefined): Pick<PoolConfig, 'ssl'> {
  if (!caPath) return {};
  return { ssl: { ca: readFileSync(caPath, 'utf8'), rejectUnauthorized: true } };
}
