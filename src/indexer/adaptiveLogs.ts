import type { PublicClient } from 'viem';
import { isRangeError } from '../lib/math.js';

const START_CHUNK = 10_000n;
const MAX_CHUNK = 50_000n;

export type LogFetcher<TItem> = (
  fromBlock: bigint,
  toBlock: bigint,
) => Promise<TItem[]>;

export type AdaptiveScanResult<TItem> = {
  items: TItem[];
  lastScannedBlock: bigint;
  blocksScanned: bigint;
};

export type AdaptiveScanOptions<TItem> = {
  startBlock: bigint;
  endBlock: bigint;
  initialChunk?: bigint;
  fetch: LogFetcher<TItem>;
};

/**
 * Chunked getLogs with adaptive window:
 * start 10k, halve on range errors, grow 1.5x after 3 clean chunks, cap 50k.
 */
export async function adaptiveLogScan<TItem>(
  options: AdaptiveScanOptions<TItem>,
): Promise<AdaptiveScanResult<TItem>> {
  const items: TItem[] = [];
  let cursor = options.startBlock;
  const endBlock = options.endBlock;
  let chunk = options.initialChunk ?? START_CHUNK;
  let cleanStreak = 0;
  let blocksScanned = 0n;

  while (cursor <= endBlock) {
    const to = cursor + chunk - 1n > endBlock ? endBlock : cursor + chunk - 1n;
    try {
      const batch = await options.fetch(cursor, to);
      items.push(...batch);
      blocksScanned += to - cursor + 1n;
      cursor = to + 1n;
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

  return {
    items,
    lastScannedBlock: cursor > endBlock ? endBlock : cursor - 1n,
    blocksScanned,
  };
}

export async function resolveHead(
  client: PublicClient,
  confirmationBuffer: bigint,
): Promise<bigint> {
  const latest = await client.getBlockNumber();
  return latest > confirmationBuffer ? latest - confirmationBuffer : 0n;
}

export async function fetchBlockTimestamps(
  client: PublicClient,
  blockNumbers: bigint[],
): Promise<Map<string, Date>> {
  const uniq = [...new Set(blockNumbers.map((b) => b.toString()))];
  const out = new Map<string, Date>();
  for (const bn of uniq) {
    const block = await client.getBlock({ blockNumber: BigInt(bn) });
    out.set(bn, new Date(Number(block.timestamp) * 1000));
  }
  return out;
}
