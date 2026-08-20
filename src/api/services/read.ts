import type { Pool } from 'pg';
import type { PoolKeyJson } from '../../types.js';
import {
  pctChange,
  poolIdHex,
  spotFromSwap,
  tierFromStartMcap,
  tradeAmounts,
  txHashHex,
} from '../format.js';

export type VisibleListingRow = {
  id: number;
  generation_id: number;
  generation_name: string;
  listing_address: string;
  token_address: string;
  creator_address: string;
  symbol: string | null;
  name: string | null;
  decimals: number | null;
  total_supply: string | null;
  listed_supply: string | null;
  side_pool_bps: number | null;
  creator_reserve: string | null;
  liquidity_locked: boolean | null;
  start_mcap_usd: string | null;
  start_price_wad: string | null;
  eth_usd_wad_stamped: string | null;
  main_pool_id: Buffer;
  side_pool_id: Buffer | null;
  main_pool_key: PoolKeyJson;
  side_pool_key: PoolKeyJson | null;
  pair_is_token0: boolean;
  token_decimals: number;
  pair_decimals: number;
  launch_block: string;
  launch_tx: Buffer;
  launched_at: Date;
};

const VISIBLE_JOIN = `
  FROM listings l
  JOIN generations g ON g.id = l.generation_id
  WHERE g.visible = true
`;

export async function getVisibleListingByToken(
  pool: Pool,
  token: string,
): Promise<VisibleListingRow | null> {
  const { rows } = await pool.query<VisibleListingRow>(
    `SELECT l.*, g.name AS generation_name
     ${VISIBLE_JOIN}
       AND lower(l.token_address) = lower($1)
     LIMIT 1`,
    [token],
  );
  return rows[0] ?? null;
}

export async function listVisibleListings(
  pool: Pool,
  limit: number,
  offset: number,
): Promise<{ rows: VisibleListingRow[]; total: number }> {
  const countRes = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count ${VISIBLE_JOIN}`,
  );
  const { rows } = await pool.query<VisibleListingRow>(
    `SELECT l.*, g.name AS generation_name
     ${VISIBLE_JOIN}
     ORDER BY l.launch_block DESC, l.id DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return { rows, total: Number(countRes.rows[0]?.count ?? 0) };
}

export async function listAllVisibleListings(pool: Pool): Promise<VisibleListingRow[]> {
  const { rows } = await pool.query<VisibleListingRow>(
    `SELECT l.*, g.name AS generation_name
     ${VISIBLE_JOIN}
     ORDER BY l.launch_block DESC, l.id DESC`,
  );
  return rows;
}

type LatestSwap = {
  listing_id: number;
  pool_id: Buffer;
  is_main_pool: boolean;
  sqrt_price_x96: string;
  liquidity: string;
  block_time: Date;
  block_number: string;
};

export async function latestSwapsByListing(
  pool: Pool,
  listingIds: number[],
): Promise<Map<number, LatestSwap>> {
  const out = new Map<number, LatestSwap>();
  if (listingIds.length === 0) return out;
  const { rows } = await pool.query<LatestSwap>(
    `SELECT DISTINCT ON (listing_id)
       listing_id, pool_id, is_main_pool, sqrt_price_x96::text, liquidity::text,
       block_time, block_number::text
     FROM swaps
     WHERE listing_id = ANY($1::int[])
     ORDER BY listing_id, block_number DESC, log_index DESC`,
    [listingIds],
  );
  for (const r of rows) out.set(r.listing_id, r);
  return out;
}

export async function latestSwapPerPool(
  pool: Pool,
  listingId: number,
): Promise<{ main: LatestSwap | null; side: LatestSwap | null }> {
  const { rows } = await pool.query<LatestSwap>(
    `SELECT DISTINCT ON (is_main_pool)
       listing_id, pool_id, is_main_pool, sqrt_price_x96::text, liquidity::text,
       block_time, block_number::text
     FROM swaps
     WHERE listing_id = $1
     ORDER BY is_main_pool DESC, block_number DESC, log_index DESC`,
    [listingId],
  );
  let main: LatestSwap | null = null;
  let side: LatestSwap | null = null;
  for (const r of rows) {
    if (r.is_main_pool) main = r;
    else side = r;
  }
  return { main, side };
}

export async function volume24hByListing(
  pool: Pool,
  listingIds: number[],
): Promise<Map<number, { volume_pair: string; swap_count: number; active_pool_id: string | null }>> {
  const out = new Map<
    number,
    { volume_pair: string; swap_count: number; active_pool_id: string | null }
  >();
  if (listingIds.length === 0) return out;

  // Active pool = most recently traded; volume summed on that pool only.
  const active = await latestSwapsByListing(pool, listingIds);
  for (const id of listingIds) {
    const a = active.get(id);
    if (!a) {
      out.set(id, { volume_pair: '0', swap_count: 0, active_pool_id: null });
      continue;
    }
    const { rows } = await pool.query<{ volume_pair: string; swap_count: string }>(
      `SELECT COALESCE(SUM(
         CASE WHEN $3::boolean THEN
           CASE WHEN l.main_pool_key->>'currency0' = lower(l.token_address)
             THEN ABS(s.amount1) ELSE ABS(s.amount0) END
         ELSE
           CASE WHEN COALESCE(l.side_pool_key->>'currency0', '') = lower(l.token_address)
             THEN ABS(s.amount1) ELSE ABS(s.amount0) END
         END
       ), 0)::text AS volume_pair,
       COUNT(*)::text AS swap_count
       FROM swaps s
       JOIN listings l ON l.id = s.listing_id
       WHERE s.listing_id = $1
         AND s.pool_id = $2
         AND s.block_time >= now() - interval '24 hours'`,
      [id, a.pool_id, a.is_main_pool],
    );
    out.set(id, {
      volume_pair: rows[0]?.volume_pair ?? '0',
      swap_count: Number(rows[0]?.swap_count ?? 0),
      active_pool_id: poolIdHex(a.pool_id),
    });
  }
  return out;
}

export async function price24hAgo(
  pool: Pool,
  listingId: number,
  activePoolId: Buffer,
  tokenAddress: string,
  key: PoolKeyJson,
  tokenDecimals: number,
  isMain: boolean,
): Promise<bigint | null> {
  const { rows } = await pool.query<{ sqrt_price_x96: string }>(
    `SELECT sqrt_price_x96::text FROM swaps
     WHERE listing_id = $1 AND pool_id = $2
       AND block_time <= now() - interval '24 hours'
     ORDER BY block_number DESC, log_index DESC
     LIMIT 1`,
    [listingId, activePoolId],
  );
  if (!rows[0]) {
    // Fall back to earliest swap on active pool (listing age < 24h).
    const early = await pool.query<{ sqrt_price_x96: string }>(
      `SELECT sqrt_price_x96::text FROM swaps
       WHERE listing_id = $1 AND pool_id = $2
       ORDER BY block_number ASC, log_index ASC
       LIMIT 1`,
      [listingId, activePoolId],
    );
    if (!early.rows[0]) return null;
    return BigInt(
      spotFromSwap({
        sqrtPriceX96: early.rows[0].sqrt_price_x96,
        liquidity: '0',
        tokenAddress,
        key,
        tokenDecimals,
        isMain,
      }).priceWad,
    );
  }
  return BigInt(
    spotFromSwap({
      sqrtPriceX96: rows[0].sqrt_price_x96,
      liquidity: '0',
      tokenAddress,
      key,
      tokenDecimals,
      isMain,
    }).priceWad,
  );
}

export type ListingSummaryJson = {
  token_address: string;
  listing_address: string;
  symbol: string | null;
  name: string | null;
  total_supply: string | null;
  listed_supply: string | null;
  tier: string;
  start_mcap_usd: string | null;
  liquidity_locked: boolean | null;
  side_pool_bps: number | null;
  launch_block: string;
  launched_at: string;
  generation: string;
  spot: {
    price_wad: string | null;
    pool_id: string | null;
    pool: 'main' | 'side' | null;
    pair_currency: string | null;
    liquidity: string | null;
    as_of: string | null;
  };
  volume_24h_pair: string;
  change_24h_pct: string | null;
};

export async function buildListingSummaries(
  pool: Pool,
  listings: VisibleListingRow[],
): Promise<ListingSummaryJson[]> {
  const ids = listings.map((l) => l.id);
  const latest = await latestSwapsByListing(pool, ids);
  const vols = await volume24hByListing(pool, ids);
  const out: ListingSummaryJson[] = [];

  for (const l of listings) {
    const last = latest.get(l.id);
    let spotPrice: string | null = null;
    let change: string | null = null;
    let pairCurrency: string | null = null;
    let poolKind: 'main' | 'side' | null = null;
    let poolId: string | null = null;
    let liq: string | null = null;
    let asOf: string | null = null;

    if (last) {
      poolKind = last.is_main_pool ? 'main' : 'side';
      poolId = poolIdHex(last.pool_id);
      asOf = last.block_time.toISOString();
      const key = last.is_main_pool ? l.main_pool_key : l.side_pool_key!;
      const spot = spotFromSwap({
        sqrtPriceX96: last.sqrt_price_x96,
        liquidity: last.liquidity,
        tokenAddress: l.token_address,
        key,
        tokenDecimals: l.token_decimals,
        isMain: last.is_main_pool,
      });
      spotPrice = spot.priceWad;
      pairCurrency = spot.pairCurrency;
      liq = spot.liquidity;
      const ago = await price24hAgo(
        pool,
        l.id,
        last.pool_id,
        l.token_address,
        key,
        l.token_decimals,
        last.is_main_pool,
      );
      if (ago != null) change = pctChange(BigInt(spotPrice), ago);
    }

    const vol = vols.get(l.id);
    out.push({
      token_address: l.token_address,
      listing_address: l.listing_address,
      symbol: l.symbol,
      name: l.name,
      total_supply: l.total_supply,
      listed_supply: l.listed_supply,
      tier: tierFromStartMcap(l.start_mcap_usd),
      start_mcap_usd: l.start_mcap_usd,
      liquidity_locked: l.liquidity_locked,
      side_pool_bps: l.side_pool_bps,
      launch_block: l.launch_block,
      launched_at: l.launched_at.toISOString(),
      generation: l.generation_name,
      spot: {
        price_wad: spotPrice,
        pool_id: poolId,
        pool: poolKind,
        pair_currency: pairCurrency,
        liquidity: liq,
        as_of: asOf,
      },
      volume_24h_pair: vol?.volume_pair ?? '0',
      change_24h_pct: change,
    });
  }
  return out;
}

export type CandleRowJson = {
  bucket_start: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume_pair: string;
  swap_count: number;
};

export async function getCandlesForActivePool(
  pool: Pool,
  listing: VisibleListingRow,
  timeframe: string,
  from: Date | null,
  to: Date | null,
  maxRows: number,
): Promise<{
  pool_id: string;
  pool: 'main' | 'side';
  timeframe: string;
  candles: CandleRowJson[];
  truncated: boolean;
}> {
  const latest = await latestSwapsByListing(pool, [listing.id]);
  const last = latest.get(listing.id);
  const activePoolId = last?.pool_id ?? listing.main_pool_id;
  const poolKind: 'main' | 'side' = last ? (last.is_main_pool ? 'main' : 'side') : 'main';

  const params: unknown[] = [activePoolId, timeframe];
  let filter = '';
  if (from) {
    params.push(from);
    filter += ` AND bucket_start >= $${params.length}`;
  }
  if (to) {
    params.push(to);
    filter += ` AND bucket_start <= $${params.length}`;
  }
  params.push(maxRows + 1);

  const { rows } = await pool.query<{
    bucket_start: Date;
    open: string;
    high: string;
    low: string;
    close: string;
    volume_pair: string;
    swap_count: number;
  }>(
    `SELECT bucket_start, open::text, high::text, low::text, close::text,
            volume_pair::text, swap_count
     FROM candles
     WHERE pool_id = $1 AND timeframe = $2 ${filter}
     ORDER BY bucket_start ASC
     LIMIT $${params.length}`,
    params,
  );

  const truncated = rows.length > maxRows;
  const slice = truncated ? rows.slice(0, maxRows) : rows;
  return {
    pool_id: poolIdHex(activePoolId),
    pool: poolKind,
    timeframe,
    candles: slice.map((r) => ({
      bucket_start: r.bucket_start.toISOString(),
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volume_pair: r.volume_pair,
      swap_count: r.swap_count,
    })),
    truncated,
  };
}

export type TradeJson = {
  direction: 'buy' | 'sell' | null;
  token_amount: string;
  pair_amount: string;
  price_wad: string;
  tx_hash: string;
  block_number: string;
  block_time: string;
  pool: 'main' | 'side';
  pool_id: string;
  sender: string;
  log_index: number;
};

export async function getRecentTrades(
  pool: Pool,
  listing: VisibleListingRow,
  limit: number,
): Promise<TradeJson[]> {
  const { rows } = await pool.query<{
    amount0: string;
    amount1: string;
    sqrt_price_x96: string;
    swap_direction: 'buy' | 'sell' | null;
    tx_hash: Buffer;
    block_number: string;
    block_time: Date;
    is_main_pool: boolean;
    pool_id: Buffer;
    sender: string;
    log_index: number;
  }>(
    `SELECT amount0::text, amount1::text, sqrt_price_x96::text, swap_direction,
            tx_hash, block_number::text, block_time, is_main_pool, pool_id,
            sender, log_index
     FROM swaps
     WHERE listing_id = $1
     ORDER BY block_number DESC, log_index DESC
     LIMIT $2`,
    [listing.id, limit],
  );

  return rows.map((r) => {
    const key = r.is_main_pool ? listing.main_pool_key : listing.side_pool_key!;
    const amts = tradeAmounts({
      amount0: r.amount0,
      amount1: r.amount1,
      tokenAddress: listing.token_address,
      key,
    });
    const spot = spotFromSwap({
      sqrtPriceX96: r.sqrt_price_x96,
      liquidity: '0',
      tokenAddress: listing.token_address,
      key,
      tokenDecimals: listing.token_decimals,
      isMain: r.is_main_pool,
    });
    return {
      direction: r.swap_direction,
      token_amount: amts.tokenAmount,
      pair_amount: amts.pairAmount,
      price_wad: spot.priceWad,
      tx_hash: txHashHex(r.tx_hash),
      block_number: r.block_number,
      block_time: r.block_time.toISOString(),
      pool: r.is_main_pool ? 'main' : 'side',
      pool_id: poolIdHex(r.pool_id),
      sender: r.sender,
      log_index: r.log_index,
    };
  });
}

export async function healthSnapshot(pool: Pool, chainHead: bigint | null): Promise<Record<string, unknown>> {
  const counts = await pool.query<{
    generations: string;
    generations_visible: string;
    generations_hidden: string;
    listings: string;
    swaps: string;
    candles: string;
  }>(
    `SELECT
       (SELECT COUNT(*)::text FROM generations) AS generations,
       (SELECT COUNT(*)::text FROM generations WHERE visible) AS generations_visible,
       (SELECT COUNT(*)::text FROM generations WHERE NOT visible) AS generations_hidden,
       (SELECT COUNT(*)::text FROM listings) AS listings,
       (SELECT COUNT(*)::text FROM swaps) AS swaps,
       (SELECT COUNT(*)::text FROM candles) AS candles`,
  );
  const gens = await pool.query<{
    name: string;
    visible: boolean;
    tracked: boolean;
    factory_address: string;
    deploy_block: string;
  }>(
    `SELECT name, visible, tracked, factory_address, deploy_block::text
     FROM generations ORDER BY deploy_block ASC`,
  );
  const cursors = await pool.query<{
    scope: string;
    last_block: string;
    updated_at: Date;
  }>(`SELECT scope, last_block::text, updated_at FROM indexer_cursors ORDER BY scope`);

  let minCursor: bigint | null = null;
  for (const c of cursors.rows) {
    const b = BigInt(c.last_block);
    if (minCursor == null || b < minCursor) minCursor = b;
  }
  const blocksBehind =
    chainHead != null && minCursor != null ? (chainHead - minCursor).toString() : null;

  return {
    ok: true,
    db: 'up',
    chain_head: chainHead?.toString() ?? null,
    oldest_cursor_block: minCursor?.toString() ?? null,
    blocks_behind_head: blocksBehind,
    counts: {
      generations: Number(counts.rows[0]?.generations ?? 0),
      generations_visible: Number(counts.rows[0]?.generations_visible ?? 0),
      generations_hidden: Number(counts.rows[0]?.generations_hidden ?? 0),
      listings: Number(counts.rows[0]?.listings ?? 0),
      swaps: Number(counts.rows[0]?.swaps ?? 0),
      candles: Number(counts.rows[0]?.candles ?? 0),
    },
    generations: gens.rows,
    cursors: cursors.rows.map((c) => ({
      scope: c.scope,
      last_block: c.last_block,
      updated_at: c.updated_at.toISOString(),
      blocks_behind:
        chainHead != null ? (chainHead - BigInt(c.last_block)).toString() : null,
    })),
  };
}
