import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getPool } from '../db/pool.js';
import { getCursor } from '../db/queries.js';
import { scanSwapsForPool, poolTargetsForListing } from '../indexer/swaps.js';
import { getChainClient } from '../chain/client.js';

const MOONER = '0x46639f9c43a688f185c83254564a6d743a27ce36';

describe('cursor discipline', () => {
  it('does not advance cursor or commit swaps when batch throws mid-flight', async () => {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const { rows: genRows } = await client.query(
        `SELECT * FROM generations WHERE name = 'express-v4' LIMIT 1`,
      );
      const gen = genRows[0];
      assert.ok(gen, 'express-v4 seeded');

      const { rows: listingRows } = await client.query(
        `SELECT * FROM listings WHERE lower(token_address) = lower($1) LIMIT 1`,
        [MOONER],
      );
      if (!listingRows[0]) {
        console.log('skip: MOONER not indexed yet (run verify:live first)');
        return;
      }
      const listing = listingRows[0];
      const targets = poolTargetsForListing(listing);
      const main = targets[0]!;
      const scope = `swaps:${main.poolIdHex.toLowerCase()}`;
      const atHead = await getCursor(client, scope);
      assert.ok(atHead != null);

      const { rows: minRows } = await client.query<{ b: string }>(
        `SELECT MIN(block_number)::text AS b FROM swaps WHERE pool_id = $1`,
        [listing.main_pool_id],
      );
      assert.ok(minRows[0]?.b, 'pool has swaps');
      const rollbackTo = BigInt(minRows[0].b) - 1n;
      await client.query(
        `DELETE FROM swaps WHERE pool_id = $1 AND block_number > $2`,
        [listing.main_pool_id, rollbackTo.toString()],
      );
      await client.query(
        `UPDATE indexer_cursors SET last_block = $2, updated_at = now() WHERE scope = $1`,
        [scope, rollbackTo.toString()],
      );

      const { rows: swapCountBefore } = await client.query(
        `SELECT COUNT(*)::int AS c FROM swaps WHERE pool_id = $1`,
        [listing.main_pool_id],
      );

      const chain = getChainClient();
      await assert.rejects(
        () =>
          scanSwapsForPool(chain, client, gen, main, atHead, {
            injectThrowAfterDecode: true,
          }),
        /injectThrowAfterDecode/,
      );

      const after = await getCursor(client, scope);
      assert.equal(after?.toString(), rollbackTo.toString(), 'cursor must not advance');

      const { rows: swapCountAfter } = await client.query(
        `SELECT COUNT(*)::int AS c FROM swaps WHERE pool_id = $1`,
        [listing.main_pool_id],
      );
      assert.equal(
        swapCountAfter[0].c,
        swapCountBefore[0].c,
        'no partial swap rows committed',
      );
    } finally {
      client.release();
    }
  });
});

describe('reorg idempotency', () => {
  it('re-index after simulated rollback produces no duplicates and same totals', async () => {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const { rows: genRows } = await client.query(
        `SELECT * FROM generations WHERE name = 'express-v4' LIMIT 1`,
      );
      const gen = genRows[0];
      assert.ok(gen);

      const { rows: listingRows } = await client.query(
        `SELECT * FROM listings WHERE lower(token_address) = lower($1) LIMIT 1`,
        [MOONER],
      );
      if (!listingRows[0]) {
        console.log('skip: MOONER not indexed yet');
        return;
      }
      const listing = listingRows[0];
      const target = poolTargetsForListing(listing)[0]!;
      const scope = `swaps:${target.poolIdHex.toLowerCase()}`;
      const cursor = await getCursor(client, scope);
      assert.ok(cursor != null && cursor > 10n);

      const sumBefore = await client.query(
        `SELECT COUNT(*)::text AS c,
                COALESCE(SUM(CASE WHEN l.main_pool_key->>'currency0' = lower(l.token_address)
                  THEN ABS(s.amount1) ELSE ABS(s.amount0) END),0)::text AS vol
         FROM swaps s JOIN listings l ON l.id = s.listing_id
         WHERE s.pool_id = $1`,
        [listing.main_pool_id],
      );
      const countBefore = BigInt(sumBefore.rows[0].c);
      const volBefore = BigInt(sumBefore.rows[0].vol);

      const rollbackTo = cursor - 5n;
      await client.query(
        `DELETE FROM swaps WHERE pool_id = $1 AND block_number > $2`,
        [listing.main_pool_id, rollbackTo.toString()],
      );
      await client.query(
        `UPDATE indexer_cursors SET last_block = $2, updated_at = now() WHERE scope = $1`,
        [scope, rollbackTo.toString()],
      );

      const chain = getChainClient();
      const head = cursor;
      await scanSwapsForPool(chain, client, gen, target, head);

      const sumAfter = await client.query(
        `SELECT COUNT(*)::text AS c,
                COALESCE(SUM(CASE WHEN l.main_pool_key->>'currency0' = lower(l.token_address)
                  THEN ABS(s.amount1) ELSE ABS(s.amount0) END),0)::text AS vol
         FROM swaps s JOIN listings l ON l.id = s.listing_id
         WHERE s.pool_id = $1`,
        [listing.main_pool_id],
      );
      const countAfter = BigInt(sumAfter.rows[0].c);
      const volAfter = BigInt(sumAfter.rows[0].vol);

      assert.equal(countAfter, countBefore, 'swap count restored idempotently');
      assert.equal(volAfter, volBefore, 'pair volume sum unchanged');

      const { rows: dupe } = await client.query(
        `SELECT tx_hash, log_index, COUNT(*) AS n FROM swaps
         WHERE pool_id = $1 GROUP BY tx_hash, log_index HAVING COUNT(*) > 1`,
        [listing.main_pool_id],
      );
      assert.equal(dupe.length, 0, 'no duplicate (tx_hash, log_index)');
    } finally {
      client.release();
    }
  });
});
