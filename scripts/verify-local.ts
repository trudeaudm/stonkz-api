import EmbeddedPostgres from 'embedded-postgres';
import { execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function main() {
  const dataDir = mkdtempSync(join(tmpdir(), 'stonkz-api-pg-'));
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port: 54329,
    persistent: false,
  });

  console.log('starting embedded postgres…');
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('stonkz_api');

  const databaseUrl =
    'postgres://postgres:postgres@127.0.0.1:54329/stonkz_api';
  process.env.DATABASE_URL = databaseUrl;
  process.env.CHAIN_ID = '4663';
  process.env.RPC_URL = 'https://rpc.mainnet.chain.robinhood.com';

  console.log('running migrations…');
  execSync('npm run migrate', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });

  console.log('running status…');
  execSync('npm run status', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });

  console.log('local verify OK');
  await pg.stop();
  await new Promise((r) => setTimeout(r, 1000));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
