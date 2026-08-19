import EmbeddedPostgres from 'embedded-postgres';
import { execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';

const MOONER = '0x46639f9c43a688f185c83254564a6d743a27ce36';

async function main() {
  if (!process.env.NODE_TLS_REJECT_UNAUTHORIZED) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  }

  const dataDir = mkdtempSync(join(tmpdir(), 'stonkz-api-live-'));
  const emb = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port: 54330,
    persistent: false,
  });

  console.log('starting embedded postgres for live verify…');
  await emb.initialise();
  await emb.start();
  await emb.createDatabase('stonkz_api');

  const databaseUrl =
    'postgres://postgres:postgres@127.0.0.1:54330/stonkz_api';
  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    CHAIN_ID: '4663',
    RPC_URL: 'https://rpc.mainnet.chain.robinhood.com',
    NODE_TLS_REJECT_UNAUTHORIZED: '0',
  };

  execSync('npm run migrate', { stdio: 'inherit', env });

  console.log('\n=== backfill express-v4 ===');
  execSync('npm run backfill -- --generation express-v4', {
    stdio: 'inherit',
    env,
  });

  console.log('\n=== generation report ===');
  execSync('npm run cli -- report-generation --generation express-v4', {
    stdio: 'inherit',
    env,
  });

  console.log('\n=== MOONER report ===');
  execSync(`npm run cli -- report-mooner --token ${MOONER}`, {
    stdio: 'inherit',
    env,
  });

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  const vol = await client.query(
    `SELECT COUNT(*)::text AS swap_count,
            COALESCE(SUM(
              CASE WHEN l.main_pool_key->>'currency0' = lower(l.token_address)
                THEN ABS(s.amount1) ELSE ABS(s.amount0) END
            ), 0)::text AS sum_pair
     FROM swaps s
     JOIN listings l ON l.id = s.listing_id
     WHERE lower(l.token_address) = lower($1)`,
    [MOONER],
  );
  const perSwap = await client.query(
    `SELECT ABS(CASE WHEN l.main_pool_key->>'currency0' = lower(l.token_address)
                THEN s.amount1 ELSE s.amount0 END)::text AS pair_amt
     FROM swaps s
     JOIN listings l ON l.id = s.listing_id
     WHERE lower(l.token_address) = lower($1)
     ORDER BY s.block_number, s.log_index`,
    [MOONER],
  );
  let manual = 0n;
  for (const row of perSwap.rows) manual += BigInt(row.pair_amt);
  const agg = BigInt(vol.rows[0].sum_pair);
  console.log('\n=== MOONER volume integrity ===');
  console.log(
    JSON.stringify(
      {
        swap_count: Number(vol.rows[0].swap_count),
        sum_pair_side: agg.toString(),
        sum_of_individual_swap_amounts: manual.toString(),
        matches: manual === agg,
      },
      null,
      2,
    ),
  );
  if (manual !== agg) process.exitCode = 1;

  await client.end();

  console.log('\n=== cursor + reorg tests ===');
  execSync('npm run test', { stdio: 'inherit', env });

  await emb.stop();
  console.log('\nlive verify complete');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
