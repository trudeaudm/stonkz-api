#!/usr/bin/env node
import { Command } from 'commander';
import { getPool, closePool, withTransaction } from './db/pool.js';
import {
  candleCountsByPool,
  getAllCursors,
  getGenerationByName,
  getListingByToken,
  getListingsForGeneration,
  getStatusCounts,
  sumPairVolumeForToken,
  swapCountsByPoolForGeneration,
} from './db/queries.js';
import { rebuildCandlesForPool } from './indexer/candles.js';
import { backfillGeneration } from './indexer/worker.js';
import { logger } from './logger.js';
import { bufferToHex } from './lib/math.js';

const program = new Command();

program.name('stonkz-api').description('STONKZ indexer CLI (Step A)');

program
  .command('status')
  .description('Print cursors and row counts')
  .action(async () => {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const counts = await getStatusCounts(client);
      const cursors = await getAllCursors(client);
      console.log(JSON.stringify({ counts, cursors }, null, 2));
    } finally {
      client.release();
      await closePool();
    }
  });

program
  .command('backfill')
  .description('Backfill listings + swaps for one generation')
  .requiredOption('--generation <name>', 'generation name, e.g. express-v4')
  .action(async (opts: { generation: string }) => {
    try {
      const summary = await backfillGeneration(opts.generation);
      console.log(JSON.stringify(summary, null, 2));
    } finally {
      await closePool();
    }
  });

program
  .command('rebuild-candles')
  .description('Rebuild derived candles from raw swaps for a pool')
  .requiredOption('--pool <id>', 'pool id hex (0x…)')
  .action(async (opts: { pool: string }) => {
    const poolHex = opts.pool.startsWith('0x') ? opts.pool : `0x${opts.pool}`;
    const poolId = Buffer.from(poolHex.slice(2), 'hex');
    await withTransaction(async (client) => {
      const { rows } = await client.query<{ id: number; token_address: string }>(
        `SELECT id, token_address FROM listings
         WHERE main_pool_id = $1 OR side_pool_id = $1 LIMIT 1`,
        [poolId],
      );
      const listing = rows[0];
      if (!listing) throw new Error(`no listing for pool ${poolHex}`);
      const full = await getListingByToken(client, listing.token_address);
      if (!full) throw new Error('listing row missing');
      const n = await rebuildCandlesForPool(client, poolId, full);
      logger.info({ pool: poolHex, candlesUpserted: n }, 'rebuild-candles done');
      console.log(JSON.stringify({ pool: poolHex, candlesUpserted: n }, null, 2));
    });
    await closePool();
  });

program
  .command('report-mooner')
  .description('Report $MOONER swap stats (verification helper)')
  .option('--token <addr>', 'token address', '0x46639f9c43a688f185c83254564a6d743a27ce36')
  .action(async (opts: { token: string }) => {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const listing = await getListingByToken(client, opts.token);
      if (!listing) throw new Error('MOONER listing not indexed');
      const vol = await sumPairVolumeForToken(client, opts.token);
      const mainCounts = await candleCountsByPool(client, listing.main_pool_id);
      const sideCounts = listing.side_pool_id
        ? await candleCountsByPool(client, listing.side_pool_id)
        : {};
      console.log(
        JSON.stringify(
          {
            token: opts.token,
            symbol: listing.symbol,
            swap_count: vol.swap_count,
            sum_pair_side: vol.sum_pair.toString(),
            main_pool: bufferToHex(listing.main_pool_id),
            side_pool: listing.side_pool_id ? bufferToHex(listing.side_pool_id) : null,
            candles_main: mainCounts,
            candles_side: sideCounts,
          },
          null,
          2,
        ),
      );
    } finally {
      client.release();
      await closePool();
    }
  });

program
  .command('report-generation')
  .description('Backfill stats for a generation')
  .requiredOption('--generation <name>', 'generation name')
  .action(async (opts: { generation: string }) => {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const gen = await getGenerationByName(client, opts.generation);
      if (!gen) throw new Error('generation not found');
      const listings = await getListingsForGeneration(client, gen.id);
      const swaps = await swapCountsByPoolForGeneration(client, gen.id);
      const cursors = await getAllCursors(client);
      console.log(
        JSON.stringify(
          {
            generation: gen.name,
            listings: listings.length,
            swaps_by_pool: swaps,
            cursors,
          },
          null,
          2,
        ),
      );
    } finally {
      client.release();
      await closePool();
    }
  });

await program.parseAsync(process.argv);
