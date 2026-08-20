import type { Address } from 'viem';
import type { PoolKeyJson } from '../types.js';
import {
  absBig,
  bufferToHex,
  pairVolumeFromAmounts,
  priceWadFromSqrt,
  tokenIsCurrency0,
} from '../lib/math.js';

export const TIER_4K = 4000n * 10n ** 18n;
export const TIER_8K = 8000n * 10n ** 18n;

export function tierFromStartMcap(startMcap: string | null): '4k' | '8k' | 'unknown' {
  if (startMcap == null) return 'unknown';
  try {
    const v = BigInt(startMcap);
    if (v === TIER_4K) return '4k';
    if (v === TIER_8K) return '8k';
  } catch {
    /* ignore */
  }
  return 'unknown';
}

export function poolIdHex(buf: Buffer): `0x${string}` {
  return bufferToHex(buf);
}

export function txHashHex(buf: Buffer): `0x${string}` {
  return bufferToHex(buf);
}

export type PoolOrientation = {
  key: PoolKeyJson;
  pairIsToken0: boolean;
  tokenDecimals: number;
  pairDecimals: number;
  tokenIsCurrency0: boolean;
  pairCurrency: 'eth' | 'usdg' | 'other';
};

export function orientationForPool(
  tokenAddress: string,
  key: PoolKeyJson,
  tokenDecimals: number,
  isMain: boolean,
): PoolOrientation {
  const tok0 = tokenIsCurrency0(key, tokenAddress as Address);
  const pairAddr = (tok0 ? key.currency1 : key.currency0).toLowerCase();
  let pairCurrency: PoolOrientation['pairCurrency'] = 'other';
  let pairDecimals = 18;
  if (pairAddr === '0x0000000000000000000000000000000000000000') {
    pairCurrency = 'eth';
    pairDecimals = 18;
  } else if (!isMain) {
    // Side pool is USDG (6 dec) by product convention.
    pairCurrency = 'usdg';
    pairDecimals = 6;
  } else {
    pairDecimals = 18;
  }
  return {
    key,
    pairIsToken0: !tok0,
    tokenDecimals,
    pairDecimals,
    tokenIsCurrency0: tok0,
    pairCurrency,
  };
}

export function spotFromSwap(args: {
  sqrtPriceX96: string;
  liquidity: string;
  tokenAddress: string;
  key: PoolKeyJson;
  tokenDecimals: number;
  isMain: boolean;
}): { priceWad: string; liquidity: string; pairCurrency: string } {
  const ori = orientationForPool(args.tokenAddress, args.key, args.tokenDecimals, args.isMain);
  const price = priceWadFromSqrt(
    BigInt(args.sqrtPriceX96),
    ori.pairIsToken0,
    ori.tokenDecimals,
    ori.pairDecimals,
  );
  return {
    priceWad: price.toString(),
    liquidity: args.liquidity,
    pairCurrency: ori.pairCurrency,
  };
}

export function tradeAmounts(args: {
  amount0: string;
  amount1: string;
  tokenAddress: string;
  key: PoolKeyJson;
}): {
  tokenAmount: string;
  pairAmount: string;
  tokenIsCurrency0: boolean;
} {
  const tok0 = tokenIsCurrency0(args.key, args.tokenAddress as Address);
  const a0 = BigInt(args.amount0);
  const a1 = BigInt(args.amount1);
  const tokenDelta = tok0 ? a0 : a1;
  const pairDelta = tok0 ? a1 : a0;
  return {
    tokenAmount: absBig(tokenDelta).toString(),
    pairAmount: absBig(pairDelta).toString(),
    tokenIsCurrency0: tok0,
  };
}

export function pairVolume(args: {
  amount0: string;
  amount1: string;
  tokenAddress: string;
  key: PoolKeyJson;
}): bigint {
  const tok0 = tokenIsCurrency0(args.key, args.tokenAddress as Address);
  return pairVolumeFromAmounts(BigInt(args.amount0), BigInt(args.amount1), tok0);
}

/** Percent change as string with 4 decimal places, or null. */
export function pctChange(now: bigint, then: bigint): string | null {
  if (then === 0n) return null;
  // (now - then) / then * 10000 → basis points-ish; keep as fixed decimal string
  const scaled = ((now - then) * 10_000_000n) / then; // 4 dp percent * 1000? 
  // percent with 4 decimals: ((now-then)*1e6)/then then format / 1e4 for percent? 
  // Want: ((now-then)/then)*100 with 4 dp → multiply by 1_000_000 then / 10000 for integer part of 4dp
  const micros = ((now - then) * 100_000_000n) / then; // percent * 1e6
  const neg = micros < 0n;
  const abs = neg ? -micros : micros;
  const whole = abs / 1_000_000n;
  const frac = (abs % 1_000_000n).toString().padStart(6, '0').slice(0, 4);
  return `${neg ? '-' : ''}${whole}.${frac}`;
}

export function isAddressLike(s: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(s);
}
