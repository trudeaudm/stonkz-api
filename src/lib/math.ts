import {
  encodeAbiParameters,
  getAddress,
  keccak256,
  toEventSelector,
  zeroAddress,
  type Address,
  type Hex,
} from 'viem';
import {
  EXPRESS_LISTED_TOPIC0_ANCHOR,
  POOL_SWAP_TOPIC0,
  expressListedEvent,
  poolSwapEvent,
} from '../chain/abis.js';
import type { PoolKeyJson } from '../types.js';

const WAD = 10n ** 18n;
const Q96 = 2n ** 96n;

export function assertExpressListedTopic0(): void {
  const computed = toEventSelector(expressListedEvent);
  if (computed.toLowerCase() !== EXPRESS_LISTED_TOPIC0_ANCHOR.toLowerCase()) {
    throw new Error(
      `ExpressListed topic0 mismatch — abi=${computed} anchor=${EXPRESS_LISTED_TOPIC0_ANCHOR}`,
    );
  }
}

export function assertSwapTopic0(): void {
  const computed = toEventSelector(poolSwapEvent);
  if (computed.toLowerCase() !== POOL_SWAP_TOPIC0.toLowerCase()) {
    throw new Error(
      `Swap topic0 mismatch — abi=${computed} anchor=${POOL_SWAP_TOPIC0}`,
    );
  }
}

export function poolIdFromKey(key: PoolKeyJson): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'address' },
        { type: 'address' },
        { type: 'uint24' },
        { type: 'int24' },
        { type: 'address' },
      ],
      [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks],
    ),
  );
}

export function hexToBuffer(hex: Hex): Buffer {
  return Buffer.from(hex.slice(2), 'hex');
}

export function bufferToHex(buf: Buffer): Hex {
  return (`0x${buf.toString('hex')}`) as Hex;
}

export function absBig(n: bigint): bigint {
  return n < 0n ? -n : n;
}

export function tokenIsCurrency0(key: PoolKeyJson, token: Address): boolean {
  return key.currency0.toLowerCase() === token.toLowerCase();
}

export function pairDecimalsForKey(key: PoolKeyJson, token: Address): number {
  const tok0 = tokenIsCurrency0(key, token);
  const pairAddr = tok0 ? key.currency1 : key.currency0;
  if (pairAddr.toLowerCase() === zeroAddress) return 18;
  return 6;
}

/** Pair-per-token price in WAD from post-swap sqrtPriceX96. Orientation stored on listing. */
export function priceWadFromSqrt(
  sqrtPriceX96: bigint,
  pairIsToken0: boolean,
  tokenDecimals: number,
  pairDecimals: number,
): bigint {
  if (sqrtPriceX96 === 0n) return 0n;
  const num = sqrtPriceX96 * sqrtPriceX96;
  const denom = Q96 * Q96;
  const decDiff = BigInt(tokenDecimals - pairDecimals);
  const scale = decDiff >= 0n ? 10n ** decDiff : 1n;
  const invScale = decDiff < 0n ? 10n ** (-decDiff) : 1n;

  if (pairIsToken0) {
    const tokensPerPairRaw = (num * scale) / (denom * invScale);
    if (tokensPerPairRaw === 0n) return 0n;
    return (WAD * WAD) / tokensPerPairRaw;
  }
  return (num * WAD * scale) / (denom * invScale);
}

export function pairVolumeFromAmounts(
  amount0: bigint,
  amount1: bigint,
  tokenIsCurrency0Flag: boolean,
): bigint {
  const abs0 = absBig(amount0);
  const abs1 = absBig(amount1);
  return tokenIsCurrency0Flag ? abs1 : abs0;
}

/**
 * Trader direction for the launch token from PoolManager Swap amounts.
 *
 * On Robinhood's v4 PoolManager, amount0/amount1 are BalanceDelta for the
 * swap caller (not pool inventory): positive token-side ⇒ caller is owed
 * tokens (buy); negative ⇒ caller owes tokens (sell). Confirmed against
 * ERC-20 Transfer (PM → trader on buys). Same rule as stonkz-site
 * useMainPoolSpot.swapDirection.
 */
export function traderDirectionFromAmounts(
  amount0: bigint,
  amount1: bigint,
  tokenIsCurrency0Flag: boolean,
): 'buy' | 'sell' {
  const tokenDelta = tokenIsCurrency0Flag ? amount0 : amount1;
  return tokenDelta > 0n ? 'buy' : 'sell';
}

export function bucketStart(date: Date, timeframe: string): Date {
  const sec = Math.floor(date.getTime() / 1000);
  let bucketSec: number;
  switch (timeframe) {
    case '1m':
      bucketSec = Math.floor(sec / 60) * 60;
      break;
    case '5m':
      bucketSec = Math.floor(sec / 300) * 300;
      break;
    case '1h':
      bucketSec = Math.floor(sec / 3600) * 3600;
      break;
    case '4h':
      bucketSec = Math.floor(sec / 14400) * 14400;
      break;
    case '1d':
      bucketSec = Math.floor(sec / 86400) * 86400;
      break;
    default:
      throw new Error(`unknown timeframe ${timeframe}`);
  }
  return new Date(bucketSec * 1000);
}

export function isRangeError(err: unknown): boolean {
  const s = String(
    err && typeof err === 'object' && 'shortMessage' in err
      ? (err as { shortMessage?: string }).shortMessage
      : err instanceof Error
        ? err.message
        : err,
  ).toLowerCase();
  return (
    s.includes('block range') ||
    s.includes('query returned more than') ||
    s.includes('response size') ||
    s.includes('exceed') ||
    s.includes('limit') ||
    s.includes('too many') ||
    s.includes('timeout')
  );
}

export function normalizeAddress(addr: string): Address {
  return getAddress(addr);
}
