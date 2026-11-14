import { readFileSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

try {
  process.loadEnvFile();
} catch {
  // .env is optional when the environment is already populated
}

const caPath = process.env.DATABASE_SSL_CA;

export default defineConfig({
  schema: './src/database/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
    ...(caPath
      ? { ssl: { ca: readFileSync(caPath, 'utf8'), rejectUnauthorized: true } }
      : {}),
  },
  strict: true,
  verbose: true,
});
