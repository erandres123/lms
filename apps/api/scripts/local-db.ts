import { existsSync } from 'node:fs';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

const port = Number(process.env.LOCAL_DB_PORT ?? 5432);
const databaseDir = path.resolve(process.cwd(), '../../.dev/pgdata');
const database = 'lms';
const user = 'lms';
const password = 'lms';

const postgres = new EmbeddedPostgres({
  databaseDir,
  port,
  user,
  password,
  persistent: true,
  autoRehydrateSymlinks: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  onLog: (message) => console.log(`[postgres] ${message}`),
  onError: (error) => console.error(`[postgres] ${String(error)}`),
});

async function shutdown(): Promise<void> {
  console.log('\nStopping local Postgres...');
  await postgres.stop().catch(() => undefined);
  process.exit(0);
}

async function main(): Promise<void> {
  if (!existsSync(path.join(databaseDir, 'PG_VERSION'))) {
    console.log(`Initialising Postgres cluster in ${databaseDir}`);
    await postgres.initialise();
  }

  await postgres.start();

  try {
    await postgres.createDatabase(database);
  } catch {
    // database already exists
  }

  console.log(`\nLocal Postgres ready`);
  console.log(`DATABASE_URL=postgres://${user}:${password}@localhost:${port}/${database}`);
  console.log('Press Ctrl+C to stop.\n');

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  await new Promise<void>(() => {
    // keep the process alive while the cluster runs
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
