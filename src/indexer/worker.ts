import type { PublicClient } from 'viem';
import { config } from '../config/env.js';
import { getPool, type DbClient } from '../db/pool.js';
import {
  deleteSwapsAboveBlock,
  getCursor,
  getListingsForGeneration,
  getTrackedGenerations,
  setCursor,
} from '../db/queries.js';
import { getChainClient } from '../chain/client.js';
import { logger } from '../logger.js';
import type { GenerationRow, IndexCycleSummary } from '../types.js';
import { LISTINGS_SCOPE, SWAPS_SCOPE } from '../types.js';
import { resolveHead } from './adaptiveLogs.js';
import { scanListingsForGeneration } from './listings.js';
import { poolTargetsForListing, scanSwapsForPool } from './swaps.js';

let lastSeenHead: bigint | null = null;

async function handleReorg(
  db: DbClient,
  generation: GenerationRow,
  listings: Awaited<ReturnType<typeof getListingsForGeneration>>,
  newHead: bigint,
): Promise<void> {
  if (lastSeenHead == null || newHead >= lastSeenHead) return;
  logger.warn(
    {
      generation: generation.name,
      lastSeenHead: lastSeenHead.toString(),
      newHead: newHead.toString(),
    },
    'reorg detected — rolling back swaps above new head',
  );
  for (const listing of listings) {
    for (const target of poolTargetsForListing(listing)) {
      const scope = SWAPS_SCOPE(target.poolIdHex);
      const cursor = await getCursor(db, scope);
      if (cursor == null || cursor <= newHead) continue;
      await deleteSwapsAboveBlock(db, target.poolId, newHead);
      await setCursor(db, scope, newHead);
    }
  }
}

export async function indexGenerationOnce(
  chain: PublicClient,
  db: DbClient,
  generation: GenerationRow,
  head: bigint,
): Promise<IndexCycleSummary> {
  if (lastSeenHead != null && head < lastSeenHead) {
    const listings = await getListingsForGeneration(db, generation.id);
    await handleReorg(db, generation, listings, head);
  }
  lastSeenHead = head;

  const listingRes = await scanListingsForGeneration(chain, db, generation, head);
  const listings = await getListingsForGeneration(db, generation.id);

  let swapsFound = 0;
  let candlesUpserted = 0;
  let blocksScanned = listingRes.blocksScanned;

  for (const listing of listings) {
    for (const target of poolTargetsForListing(listing)) {
      const swapRes = await scanSwapsForPool(chain, db, generation, target, head);
      swapsFound += swapRes.swapsFound;
      candlesUpserted += swapRes.candlesUpserted;
      blocksScanned += swapRes.blocksScanned;
    }
  }

  const cursorScopes: Record<string, string> = {};
  const listScope = LISTINGS_SCOPE(generation.factory_address);
  const listCursor = await getCursor(db, listScope);
  if (listCursor != null) cursorScopes[listScope] = listCursor.toString();
  for (const listing of listings) {
    for (const target of poolTargetsForListing(listing)) {
      const scope = SWAPS_SCOPE(target.poolIdHex);
      const c = await getCursor(db, scope);
      if (c != null) cursorScopes[scope] = c.toString();
    }
  }

  const summary: IndexCycleSummary = {
    generation: generation.name,
    blocksScanned: blocksScanned.toString(),
    listingsFound: listingRes.listingsFound,
    swapsFound,
    candlesUpserted,
    cursorScopes,
  };
  logger.info(summary, 'index cycle complete');
  return summary;
}

export async function backfillGeneration(name: string): Promise<IndexCycleSummary> {
  const chain = getChainClient();
  const pool = getPool();
  const client = await pool.connect();
  try {
    const { rows } = await client.query<GenerationRow>(
      `SELECT * FROM generations WHERE name = $1 LIMIT 1`,
      [name],
    );
    const generation = rows[0];
    if (!generation) throw new Error(`generation not found: ${name}`);
    const head = await resolveHead(chain, BigInt(config.confirmationBuffer));
    return indexGenerationOnce(chain, client, generation, head);
  } finally {
    client.release();
  }
}

export async function runWorker(): Promise<void> {
  const chain = getChainClient();
  logger.info(
    {
      chainId: config.chainId,
      confirmationBuffer: config.confirmationBuffer,
      pollIntervalMs: config.pollIntervalMs,
    },
    'indexer worker starting',
  );

  while (true) {
    try {
      const pool = getPool();
      const db = await pool.connect();
      try {
        const generations = await getTrackedGenerations(db);
        const head = await resolveHead(chain, BigInt(config.confirmationBuffer));
        for (const generation of generations) {
          await indexGenerationOnce(chain, db, generation, head);
        }
      } finally {
        db.release();
      }
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        'index cycle failed — cursors unchanged for failed batch',
      );
    }
    await new Promise((r) => setTimeout(r, config.pollIntervalMs));
  }
}

export async function simulateReorgForPool(
  poolIdHex: string,
  dropBlocks: bigint,
): Promise<{ deleted: number; cursor: string }> {
  const pool = getPool();
  const db = await pool.connect();
  try {
    const scope = SWAPS_SCOPE(poolIdHex as `0x${string}`);
    const cursor = await getCursor(db, scope);
    if (cursor == null) throw new Error(`no cursor for ${scope}`);
    const newCursor = cursor > dropBlocks ? cursor - dropBlocks : 0n;
    const poolId = Buffer.from(poolIdHex.replace(/^0x/, ''), 'hex');
    const deleted = await deleteSwapsAboveBlock(db, poolId, newCursor);
    await setCursor(db, scope, newCursor);
    return { deleted, cursor: newCursor.toString() };
  } finally {
    db.release();
  }
}
