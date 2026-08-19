import type { DbClient } from '../db/pool.js';
import {
  deleteAllCandlesForPool,
  getSwapsForPool,
  upsertCandles,
  type CandleUpsert,
} from '../db/queries.js';
import {
  bucketStart,
  pairVolumeFromAmounts,
  priceWadFromSqrt,
  tokenIsCurrency0,
} from '../lib/math.js';
import type { Address } from 'viem';
import { CANDLE_TIMEFRAMES, type ListingRow } from '../types.js';

export async function rebuildCandlesForPool(
  db: DbClient,
  poolId: Buffer,
  listing: ListingRow,
): Promise<number> {
  await deleteAllCandlesForPool(db, poolId);
  const swaps = await getSwapsForPool(db, poolId);
  const tokenAddr = listing.token_address as Address;
  const tok0 = tokenIsCurrency0(listing.main_pool_key, tokenAddr);
  const map = new Map<string, CandleUpsert>();

  for (const s of swaps) {
    const amount0 = BigInt(s.amount0);
    const amount1 = BigInt(s.amount1);
    const sqrt = BigInt(s.sqrt_price_x96);
    const price = priceWadFromSqrt(
      sqrt,
      s.pair_is_token0,
      s.token_decimals,
      s.pair_decimals,
    );
    const vol = pairVolumeFromAmounts(amount0, amount1, tok0);
    for (const tf of CANDLE_TIMEFRAMES) {
      const start = bucketStart(s.block_time, tf);
      const key = `${tf}:${start.toISOString()}`;
      const existing = map.get(key);
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

  return upsertCandles(db, [...map.values()]);
}

export function sumPairVolumeFromSwaps(
  swaps: Array<{ amount0: string; amount1: string }>,
  tokenIsCurrency0Flag: boolean,
): bigint {
  let total = 0n;
  for (const s of swaps) {
    total += pairVolumeFromAmounts(
      BigInt(s.amount0),
      BigInt(s.amount1),
      tokenIsCurrency0Flag,
    );
  }
  return total;
}

export function perSwapPairVolumes(
  swaps: Array<{ amount0: string; amount1: string }>,
  tokenIsCurrency0Flag: boolean,
): bigint[] {
  return swaps.map((s) =>
    pairVolumeFromAmounts(
      BigInt(s.amount0),
      BigInt(s.amount1),
      tokenIsCurrency0Flag,
    ),
  );
}

export function verifyVolumeIntegrity(
  perSwap: bigint[],
  aggregate: bigint,
): boolean {
  let sum = 0n;
  for (const v of perSwap) sum += v;
  return sum === aggregate && sum === perSwap.reduce((a, b) => a + b, 0n);
}
