import type { DbClient } from './pool.js';
import type {
  CandleTimeframe,
  GenerationRow,
  ListingRow,
  PoolKeyJson,
  SwapInsert,
} from '../types.js';

export async function getTrackedGenerations(client: DbClient): Promise<GenerationRow[]> {
  const { rows } = await client.query<GenerationRow>(
    `SELECT * FROM generations WHERE tracked = true ORDER BY deploy_block ASC`,
  );
  return rows;
}

export async function getGenerationByName(
  client: DbClient,
  name: string,
): Promise<GenerationRow | null> {
  const { rows } = await client.query<GenerationRow>(
    `SELECT * FROM generations WHERE name = $1 LIMIT 1`,
    [name],
  );
  return rows[0] ?? null;
}

export async function getCursor(
  client: DbClient,
  scope: string,
): Promise<bigint | null> {
  const { rows } = await client.query<{ last_block: string }>(
    `SELECT last_block::text FROM indexer_cursors WHERE scope = $1`,
    [scope],
  );
  if (!rows[0]) return null;
  return BigInt(rows[0].last_block);
}

export async function ensureCursor(
  client: DbClient,
  scope: string,
  startBlock: bigint,
): Promise<bigint> {
  const existing = await getCursor(client, scope);
  if (existing != null) return existing;
  await client.query(
    `INSERT INTO indexer_cursors (scope, last_block) VALUES ($1, $2)
     ON CONFLICT (scope) DO NOTHING`,
    [scope, startBlock.toString()],
  );
  return startBlock;
}

export async function setCursor(
  client: DbClient,
  scope: string,
  lastBlock: bigint,
): Promise<void> {
  await client.query(
    `INSERT INTO indexer_cursors (scope, last_block, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (scope) DO UPDATE
       SET last_block = EXCLUDED.last_block,
           updated_at = now()`,
    [scope, lastBlock.toString()],
  );
}

export async function listingExists(
  client: DbClient,
  generationId: number,
  listingAddress: string,
): Promise<boolean> {
  const { rows } = await client.query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM listings
       WHERE generation_id = $1 AND listing_address = $2
     ) AS exists`,
    [generationId, listingAddress.toLowerCase()],
  );
  return rows[0]?.exists ?? false;
}

export type ListingInsert = {
  generation_id: number;
  listing_address: string;
  token_address: string;
  creator_address: string;
  symbol: string;
  name: string;
  decimals: number;
  total_supply: bigint;
  listed_supply: bigint;
  side_pool_bps: number;
  creator_reserve: bigint;
  liquidity_locked: boolean;
  start_mcap_usd: bigint;
  start_price_wad: bigint;
  eth_usd_wad_stamped: bigint | null;
  main_pool_id: Buffer;
  side_pool_id: Buffer | null;
  main_pool_key: PoolKeyJson;
  side_pool_key: PoolKeyJson | null;
  pair_is_token0: boolean;
  token_decimals: number;
  pair_decimals: number;
  launch_block: bigint;
  launch_tx: Buffer;
  launched_at: Date;
};

export async function insertListing(
  client: DbClient,
  row: ListingInsert,
): Promise<number> {
  const { rows } = await client.query<{ id: number }>(
    `INSERT INTO listings (
      generation_id, listing_address, token_address, creator_address,
      symbol, name, decimals, total_supply, listed_supply, side_pool_bps,
      creator_reserve, liquidity_locked, start_mcap_usd, start_price_wad,
      eth_usd_wad_stamped, main_pool_id, side_pool_id, main_pool_key, side_pool_key,
      pair_is_token0, token_decimals, pair_decimals,
      launch_block, launch_tx, launched_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25
    )
    ON CONFLICT (token_address) DO NOTHING
    RETURNING id`,
    [
      row.generation_id,
      row.listing_address.toLowerCase(),
      row.token_address.toLowerCase(),
      row.creator_address.toLowerCase(),
      row.symbol,
      row.name,
      row.decimals,
      row.total_supply.toString(),
      row.listed_supply.toString(),
      row.side_pool_bps,
      row.creator_reserve.toString(),
      row.liquidity_locked,
      row.start_mcap_usd.toString(),
      row.start_price_wad.toString(),
      row.eth_usd_wad_stamped?.toString() ?? null,
      row.main_pool_id,
      row.side_pool_id,
      JSON.stringify(row.main_pool_key),
      row.side_pool_key ? JSON.stringify(row.side_pool_key) : null,
      row.pair_is_token0,
      row.token_decimals,
      row.pair_decimals,
      row.launch_block.toString(),
      row.launch_tx,
      row.launched_at,
    ],
  );
  return rows[0]?.id ?? 0;
}

export async function getListingsForGeneration(
  client: DbClient,
  generationId: number,
): Promise<ListingRow[]> {
  const { rows } = await client.query<ListingRow>(
    `SELECT * FROM listings WHERE generation_id = $1 ORDER BY launch_block ASC`,
    [generationId],
  );
  return rows;
}

export async function getListingByToken(
  client: DbClient,
  tokenAddress: string,
): Promise<ListingRow | null> {
  const { rows } = await client.query<ListingRow>(
    `SELECT * FROM listings WHERE token_address = $1 LIMIT 1`,
    [tokenAddress.toLowerCase()],
  );
  return rows[0] ?? null;
}

export async function insertSwapsBatch(
  client: DbClient,
  swaps: SwapInsert[],
): Promise<number> {
  if (swaps.length === 0) return 0;
  let inserted = 0;
  for (const s of swaps) {
    const res = await client.query(
      `INSERT INTO swaps (
        pool_id, listing_id, is_main_pool, block_number, block_time,
        tx_hash, log_index, sender, amount0, amount1,
        sqrt_price_x96, tick, liquidity, swap_direction
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
      )
      ON CONFLICT (tx_hash, log_index) DO NOTHING`,
      [
        s.pool_id,
        s.listing_id,
        s.is_main_pool,
        s.block_number.toString(),
        s.block_time,
        s.tx_hash,
        s.log_index,
        s.sender.toLowerCase(),
        s.amount0.toString(),
        s.amount1.toString(),
        s.sqrt_price_x96.toString(),
        s.tick,
        s.liquidity.toString(),
        s.swap_direction,
      ],
    );
    inserted += res.rowCount ?? 0;
  }
  return inserted;
}

export type CandleUpsert = {
  pool_id: Buffer;
  timeframe: CandleTimeframe;
  bucket_start: Date;
  open: bigint;
  high: bigint;
  low: bigint;
  close: bigint;
  volume_pair: bigint;
  swap_count: number;
};

export async function upsertCandles(
  client: DbClient,
  candles: CandleUpsert[],
): Promise<number> {
  if (candles.length === 0) return 0;
  let count = 0;
  for (const c of candles) {
    await client.query(
      `INSERT INTO candles (
        pool_id, timeframe, bucket_start, open, high, low, close, volume_pair, swap_count
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (pool_id, timeframe, bucket_start) DO UPDATE SET
        open = LEAST(candles.open, EXCLUDED.open),
        high = GREATEST(candles.high, EXCLUDED.high),
        low = LEAST(candles.low, EXCLUDED.low),
        close = EXCLUDED.close,
        volume_pair = candles.volume_pair + EXCLUDED.volume_pair,
        swap_count = candles.swap_count + EXCLUDED.swap_count`,
      [
        c.pool_id,
        c.timeframe,
        c.bucket_start,
        c.open.toString(),
        c.high.toString(),
        c.low.toString(),
        c.close.toString(),
        c.volume_pair.toString(),
        c.swap_count,
      ],
    );
    count += 1;
  }
  return count;
}

export async function deleteSwapsAboveBlock(
  client: DbClient,
  poolId: Buffer,
  blockNumber: bigint,
): Promise<number> {
  const res = await client.query(
    `DELETE FROM swaps WHERE pool_id = $1 AND block_number > $2`,
    [poolId, blockNumber.toString()],
  );
  return res.rowCount ?? 0;
}

export async function deleteCandlesFromTime(
  client: DbClient,
  poolId: Buffer,
  from: Date,
): Promise<number> {
  const res = await client.query(
    `DELETE FROM candles WHERE pool_id = $1 AND bucket_start >= $2`,
    [poolId, from],
  );
  return res.rowCount ?? 0;
}

export async function deleteAllCandlesForPool(
  client: DbClient,
  poolId: Buffer,
): Promise<number> {
  const res = await client.query(`DELETE FROM candles WHERE pool_id = $1`, [poolId]);
  return res.rowCount ?? 0;
}

export async function getStatusCounts(client: DbClient): Promise<Record<string, number>> {
  const tables = ['generations', 'listings', 'swaps', 'candles', 'token_metadata'];
  const out: Record<string, number> = {};
  for (const t of tables) {
    const { rows } = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ${t}`,
    );
    out[t] = Number(rows[0]?.count ?? 0);
  }
  return out;
}

export async function getAllCursors(
  client: DbClient,
): Promise<Array<{ scope: string; last_block: string; updated_at: Date }>> {
  const { rows } = await client.query<{ scope: string; last_block: string; updated_at: Date }>(
    `SELECT scope, last_block::text, updated_at FROM indexer_cursors ORDER BY scope`,
  );
  return rows;
}

export async function sumPairVolumeForToken(
  client: DbClient,
  tokenAddress: string,
): Promise<{ swap_count: number; sum_pair: bigint }> {
  const { rows } = await client.query<{ swap_count: string; sum_pair: string | null }>(
    `SELECT COUNT(*)::text AS swap_count,
            COALESCE(SUM(
              CASE WHEN l.main_pool_id = s.pool_id THEN
                CASE WHEN l.main_pool_key->>'currency0' = lower(l.token_address)
                  THEN ABS(s.amount1) ELSE ABS(s.amount0) END
              ELSE
                CASE WHEN l.side_pool_key->>'currency0' = lower(l.token_address)
                  THEN ABS(s.amount1) ELSE ABS(s.amount0) END
              END
            ), 0)::text AS sum_pair
     FROM swaps s
     JOIN listings l ON l.id = s.listing_id
     WHERE lower(l.token_address) = lower($1)`,
    [tokenAddress],
  );
  return {
    swap_count: Number(rows[0]?.swap_count ?? 0),
    sum_pair: BigInt(rows[0]?.sum_pair ?? 0),
  };
}

export async function swapCountsByPoolForGeneration(
  client: DbClient,
  generationId: number,
): Promise<Array<{ symbol: string; pool: string; is_main: boolean; count: number }>> {
  const { rows } = await client.query<{
    symbol: string;
    pool: string;
    is_main: boolean;
    count: string;
  }>(
    `SELECT l.symbol, encode(s.pool_id, 'hex') AS pool, s.is_main_pool AS is_main,
            COUNT(*)::text AS count
     FROM swaps s
     JOIN listings l ON l.id = s.listing_id
     WHERE l.generation_id = $1
     GROUP BY l.symbol, s.pool_id, s.is_main_pool
     ORDER BY l.symbol, s.is_main_pool DESC`,
    [generationId],
  );
  return rows.map((r) => ({
    symbol: r.symbol ?? '?',
    pool: r.pool,
    is_main: r.is_main,
    count: Number(r.count),
  }));
}

export async function candleCountsByPool(
  client: DbClient,
  poolId: Buffer,
): Promise<Record<string, number>> {
  const { rows } = await client.query<{ timeframe: string; count: string }>(
    `SELECT timeframe, COUNT(*)::text AS count
     FROM candles WHERE pool_id = $1
     GROUP BY timeframe ORDER BY timeframe`,
    [poolId],
  );
  const out: Record<string, number> = {};
  for (const r of rows) out[r.timeframe] = Number(r.count);
  return out;
}

export async function getSwapsForPool(
  client: DbClient,
  poolId: Buffer,
): Promise<
  Array<{
    block_time: Date;
    amount0: string;
    amount1: string;
    sqrt_price_x96: string;
    pair_is_token0: boolean;
    token_decimals: number;
    pair_decimals: number;
  }>
> {
  const { rows } = await client.query<{
    block_time: Date;
    amount0: string;
    amount1: string;
    sqrt_price_x96: string;
    pair_is_token0: boolean;
    token_decimals: number;
    pair_decimals: number;
  }>(
    `SELECT s.block_time, s.amount0::text, s.amount1::text, s.sqrt_price_x96::text,
            l.pair_is_token0, l.token_decimals, l.pair_decimals
     FROM swaps s
     JOIN listings l ON l.id = s.listing_id
     WHERE s.pool_id = $1
     ORDER BY s.block_number ASC, s.log_index ASC`,
    [poolId],
  );
  return rows;
}
