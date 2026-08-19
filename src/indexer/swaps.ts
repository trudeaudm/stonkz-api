import type { Address, Hex, Log, PublicClient } from 'viem';
import { poolSwapEvent } from '../chain/abis.js';
import type { DbClient } from '../db/pool.js';
import { withTransaction } from '../db/pool.js';
import {
  ensureCursor,
  insertSwapsBatch,
  setCursor,
  upsertCandles,
  type CandleUpsert,
} from '../db/queries.js';
import {
  assertSwapTopic0,
  bucketStart,
  hexToBuffer,
  isRangeError,
  normalizeAddress,
  pairVolumeFromAmounts,
  priceWadFromSqrt,
  tokenIsCurrency0,
} from '../lib/math.js';
import {
  CANDLE_TIMEFRAMES,
  type DecodedSwap,
  type GenerationRow,
  type ListingRow,
  type SwapInsert,
} from '../types.js';
import { SWAPS_SCOPE } from '../types.js';
import { fetchBlockTimestamps } from './adaptiveLogs.js';

const START_CHUNK = 10_000n;
const MAX_CHUNK = 50_000n;

type SwapArgs = {
  id: Hex;
  sender: Address;
  amount0: bigint;
  amount1: bigint;
  sqrtPriceX96: bigint;
  liquidity: bigint;
  tick: number;
};

function parseSwapLog(log: Log & { args?: Partial<SwapArgs> }): DecodedSwap | null {
  if (!log.args || typeof log.args !== 'object') return null;
  const a = log.args as Partial<SwapArgs>;
  if (
    a.sender == null ||
    a.amount0 == null ||
    a.amount1 == null ||
    a.sqrtPriceX96 == null ||
    a.liquidity == null ||
    a.tick == null
  ) {
    return null;
  }
  if (log.blockNumber == null || log.transactionHash == null) return null;
  return {
    blockNumber: log.blockNumber,
    logIndex: log.logIndex ?? 0,
    txHash: log.transactionHash,
    sender: a.sender,
    amount0: a.amount0,
    amount1: a.amount1,
    sqrtPriceX96: a.sqrtPriceX96,
    liquidity: a.liquidity,
    tick: Number(a.tick),
  };
}

function buildCandleUpserts(
  listing: ListingRow,
  poolId: Buffer,
  swaps: SwapInsert[],
): CandleUpsert[] {
  const map = new Map<string, CandleUpsert>();
  const tokenAddr = listing.token_address as Address;
  const mainKey = listing.main_pool_key;
  const tok0 = tokenIsCurrency0(mainKey, tokenAddr);

  for (const s of swaps) {
    for (const tf of CANDLE_TIMEFRAMES) {
      const start = bucketStart(s.block_time, tf);
      const key = `${tf}:${start.toISOString()}`;
      const existing = map.get(key);
      const price = priceWadFromSqrt(
        s.sqrt_price_x96,
        listing.pair_is_token0,
        listing.token_decimals,
        listing.pair_decimals,
      );
      const vol = pairVolumeFromAmounts(s.amount0, s.amount1, tok0);
      if (!existing) {
        map.set(key, {
          pool_id: poolId,
          timeframe: tf,
          bucket_start: start,
          open: price,
          high: price,
          low: price,
          close: price,
          volume_pair: vol,
          swap_count: 1,
        });
      } else {
        existing.high = price > existing.high ? price : existing.high;
        existing.low = price < existing.low ? price : existing.low;
        existing.close = price;
        existing.volume_pair += vol;
        existing.swap_count += 1;
      }
    }
  }
  return [...map.values()];
}

export type PoolScanTarget = {
  poolId: Buffer;
  poolIdHex: Hex;
  listing: ListingRow;
  isMain: boolean;
  fromBlock: bigint;
};

export type SwapsScanResult = {
  swapsFound: number;
  candlesUpserted: number;
  blocksScanned: bigint;
  cursor: bigint;
};

export async function scanSwapsForPool(
  chain: PublicClient,
  db: DbClient,
  generation: GenerationRow,
  target: PoolScanTarget,
  head: bigint,
  options?: { injectThrowAfterDecode?: boolean },
): Promise<SwapsScanResult> {
  assertSwapTopic0();
  const pm = normalizeAddress(generation.pool_manager_address);
  const scope = SWAPS_SCOPE(target.poolIdHex);
  let cursor = await ensureCursor(db, scope, target.fromBlock - 1n);
  let swapsFound = 0;
  let candlesUpserted = 0;
  let blocksScanned = 0n;
  let chunk = START_CHUNK;
  let cleanStreak = 0;
  let injectThrow = options?.injectThrowAfterDecode ?? false;

  while (cursor < head) {
    const from = cursor + 1n;
    const to = from + chunk - 1n > head ? head : from + chunk - 1n;
    try {
      const logs = await chain.getLogs({
        address: pm,
        event: poolSwapEvent,
        args: { id: target.poolIdHex },
        fromBlock: from,
        toBlock: to,
      });
      const decoded: DecodedSwap[] = [];
      for (const log of logs) {
        const parsed = parseSwapLog(log as Log);
        if (!parsed) {
          throw new Error(
            `swap decode failed pool=${target.poolIdHex} block=${log.blockNumber?.toString() ?? '?'}`,
          );
        }
        decoded.push(parsed);
      }

      if (injectThrow && decoded.length > 0) {
        injectThrow = false;
        throw new Error('injectThrowAfterDecode: forced error (cursor must not advance)');
      }

      await withTransaction(async (tx) => {
        if (decoded.length > 0) {
          const blockTs = await fetchBlockTimestamps(
            chain,
            decoded.map((s) => s.blockNumber),
          );
          const tokenAddr = target.listing.token_address as Address;
          const tok0 = tokenIsCurrency0(target.listing.main_pool_key, tokenAddr);
          const swapRows: SwapInsert[] = decoded.map((ev) => ({
            pool_id: target.poolId,
            listing_id: target.listing.id,
            is_main_pool: target.isMain,
            block_number: ev.blockNumber,
            block_time: blockTs.get(ev.blockNumber.toString()) ?? new Date(0),
            tx_hash: hexToBuffer(ev.txHash),
            log_index: ev.logIndex,
            sender: ev.sender,
            amount0: ev.amount0,
            amount1: ev.amount1,
            sqrt_price_x96: ev.sqrtPriceX96,
            tick: ev.tick,
            liquidity: ev.liquidity,
            price_wad: priceWadFromSqrt(
              ev.sqrtPriceX96,
              target.listing.pair_is_token0,
              target.listing.token_decimals,
              target.listing.pair_decimals,
            ),
            pair_volume: pairVolumeFromAmounts(ev.amount0, ev.amount1, tok0),
          }));
          swapsFound += await insertSwapsBatch(tx, swapRows);
          candlesUpserted += await upsertCandles(
            tx,
            buildCandleUpserts(target.listing, target.poolId, swapRows),
          );
        }
        await setCursor(tx, scope, to);
      });

      blocksScanned += to - from + 1n;
      cursor = to;
      cleanStreak += 1;
      if (cleanStreak >= 3) {
        const grown = (chunk * 3n) / 2n;
        chunk = grown > MAX_CHUNK ? MAX_CHUNK : grown;
        cleanStreak = 0;
      }
    } catch (err) {
      if (isRangeError(err) && chunk > 1n) {
        chunk = chunk / 2n > 0n ? chunk / 2n : 1n;
        cleanStreak = 0;
        continue;
      }
      throw err;
    }
  }

  return { swapsFound, candlesUpserted, blocksScanned, cursor };
}

export function poolTargetsForListing(listing: ListingRow): PoolScanTarget[] {
  const mainHex = (`0x${listing.main_pool_id.toString('hex')}`) as Hex;
  const targets: PoolScanTarget[] = [
    {
      poolId: listing.main_pool_id,
      poolIdHex: mainHex,
      listing,
      isMain: true,
      fromBlock: BigInt(listing.launch_block),
    },
  ];
  if (listing.side_pool_id) {
    const sideHex = (`0x${listing.side_pool_id.toString('hex')}`) as Hex;
    targets.push({
      poolId: listing.side_pool_id,
      poolIdHex: sideHex,
      listing,
      isMain: false,
      fromBlock: BigInt(listing.launch_block),
    });
  }
  return targets;
}

export async function scanSwapsForGeneration(
  chain: PublicClient,
  db: DbClient,
  generation: GenerationRow,
  listings: ListingRow[],
  head: bigint,
): Promise<{ swapsFound: number; candlesUpserted: number; blocksScanned: bigint }> {
  let swapsFound = 0;
  let candlesUpserted = 0;
  let blocksScanned = 0n;
  for (const listing of listings) {
    for (const target of poolTargetsForListing(listing)) {
      const res = await scanSwapsForPool(chain, db, generation, target, head);
      swapsFound += res.swapsFound;
      candlesUpserted += res.candlesUpserted;
      blocksScanned += res.blocksScanned;
    }
  }
  return { swapsFound, candlesUpserted, blocksScanned };
}
