import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { Client } from 'pg';

const caPath = process.env.DATABASE_SSL_CA;
const srcConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: caPath ? { ca: fs.readFileSync(caPath, 'utf8'), rejectUnauthorized: true } : undefined,
};

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const scratchDb = `lms_drill_${stamp}`;
const localUrl = `postgres://lms:lms@localhost:5432/${scratchDb}`;
const outDir = path.resolve('../../.local/backup-drill', stamp);
fs.mkdirSync(outDir, { recursive: true });

async function columnsWithSequence(client) {
  const r = await client.query(
    `select table_name, column_name from information_schema.columns
     where table_schema='public' and column_default like 'nextval%' order by table_name`,
  );
  return r.rows;
}

async function tableHashes(client, tables) {
  await client.query("set timezone='UTC'");
  const out = {};
  for (const t of tables) {
    const r = await client.query(
      `select count(*)::int as n, md5(coalesce(string_agg(x::text, '|' order by x::text), '')) as h
       from (select * from "${t}") x`,
    );
    out[t] = { rows: r.rows[0].n, hash: r.rows[0].h };
  }
  return out;
}

const src = new Client(srcConfig);
await src.connect();

const tableRows = await src.query(
  `select table_name from information_schema.tables
   where table_schema='public' and table_type='BASE TABLE' order by table_name`,
);
const tables = tableRows.rows.map((r) => r.table_name);

console.log(`source tables: ${tables.length}`);

const dumpStart = Date.now();
await src.query('begin isolation level repeatable read read only');
const sourceState = await tableHashes(src, tables);
let bytes = 0;
for (const t of tables) {
  const r = await src.query(`select coalesce(json_agg(x), '[]'::json) as rows from (select * from "${t}") x`);
  const text = JSON.stringify(r.rows[0].rows);
  fs.writeFileSync(path.join(outDir, `${t}.json`), text);
  bytes += Buffer.byteLength(text);
}
await src.query('commit');
const dumpMs = Date.now() - dumpStart;
const seqColumns = await columnsWithSequence(src);
await src.end();

console.log(`dump: ${dumpMs} ms, ${(bytes / 1024).toFixed(1)} KiB across ${tables.length} tables`);
console.log(`snapshot dir: ${outDir}`);

const admin = new Client({ connectionString: 'postgres://lms:lms@localhost:5432/lms' });
await admin.connect();
await admin.query(`drop database if exists "${scratchDb}"`);
await admin.query(`create database "${scratchDb}"`);
await admin.end();

const migrateStart = Date.now();
execSync('pnpm exec drizzle-kit migrate', {
  cwd: process.cwd(),
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: localUrl, DATABASE_SSL_CA: '' },
});
const migrateMs = Date.now() - migrateStart;

const dst = new Client({ connectionString: localUrl });
await dst.connect();
const restoreStart = Date.now();
await dst.query('begin');
await dst.query("set local session_replication_role = replica");
for (const t of tables) {
  const text = fs.readFileSync(path.join(outDir, `${t}.json`), 'utf8');
  await dst.query(
    `insert into "${t}" select * from json_populate_recordset(null::"${t}", $1::json)`,
    [text],
  );
}
await dst.query('commit');
for (const { table_name, column_name } of seqColumns) {
  await dst.query(
    `select setval(pg_get_serial_sequence('"${table_name}"', '${column_name}'),
       coalesce((select max("${column_name}") from "${table_name}"), 0) + 1, false)`,
  );
}
const restoreMs = Date.now() - restoreStart;

const restoredState = await tableHashes(dst, tables);

let mismatches = 0;
for (const t of tables) {
  const a = sourceState[t];
  const b = restoredState[t];
  if (a.rows !== b.rows || a.hash !== b.hash) {
    mismatches += 1;
    console.log(`MISMATCH ${t}: source ${a.rows}/${a.hash} vs restored ${b.rows}/${b.hash}`);
  }
}
console.log(`row/hash mismatches: ${mismatches}`);

const rls = await dst.query(
  `select count(*) filter (where c.relrowsecurity)::int as rls_tables,
          count(*)::int as tables
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname='public' and c.relkind='r'`,
);
const policies = await dst.query(`select count(*)::int as n from pg_policies where schemaname='public'`);
const srcRls = await (async () => {
  const c = new Client(srcConfig);
  await c.connect();
  const r = await c.query(
    `select count(*) filter (where c2.relrowsecurity)::int as rls_tables, count(*)::int as tables
     from pg_class c2 join pg_namespace n on n.oid = c2.relnamespace
     where n.nspname='public' and c2.relkind='r'`,
  );
  const p = await c.query(`select count(*)::int as n from pg_policies where schemaname='public'`);
  await c.end();
  return { rls: r.rows[0], policies: p.rows[0].n };
})();
console.log(
  `rls: source ${srcRls.rls.rls_tables}/${srcRls.rls.tables} tables, ${srcRls.policies} policies; ` +
    `restored ${rls.rows[0].rls_tables}/${rls.rows[0].tables} tables, ${policies.rows[0].n} policies`,
);

await dst.end();
console.log(`migrate: ${migrateMs} ms, restore: ${restoreMs} ms, total restore-ready: ${migrateMs + restoreMs} ms`);
console.log(`SCRATCH_DB=${scratchDb}`);
console.log(`LOCAL_URL=${localUrl}`);
if (mismatches > 0) process.exitCode = 1;
