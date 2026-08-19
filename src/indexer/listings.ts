import type { Address, Hex, Log, PublicClient } from 'viem';
import {
  directListingAbi,
  expressListedEvent,
  launchTokenAbi,
} from '../chain/abis.js';
import type { DbClient } from '../db/pool.js';
import { withTransaction } from '../db/pool.js';
import {
  ensureCursor,
  insertListing,
  listingExists,
  setCursor,
  type ListingInsert,
} from '../db/queries.js';
import {
  assertExpressListedTopic0,
  hexToBuffer,
  isRangeError,
  normalizeAddress,
  pairDecimalsForKey,
  poolIdFromKey,
} from '../lib/math.js';
import type { FreshExpressLog, GenerationRow, PoolKeyJson } from '../types.js';
import { LISTINGS_SCOPE } from '../types.js';
import { fetchBlockTimestamps } from './adaptiveLogs.js';

const START_CHUNK = 10_000n;
const MAX_CHUNK = 50_000n;

type McResult = {
  status: 'success' | 'failure';
  result?: unknown;
};

function parseExpressLog(log: Log & { args?: Partial<FreshExpressLog> }): FreshExpressLog | null {
  if (!log.args || typeof log.args !== 'object') return null;
  const a = log.args as Partial<FreshExpressLog>;
  if (!a.listing || !a.token || !a.creator) return null;
  if (log.blockNumber == null || log.transactionHash == null) return null;
  return {
    listing: a.listing,
    token: a.token,
    creator: a.creator,
    userSalt: (a.userSalt ?? '0x') as Hex,
    salt: (a.salt ?? '0x') as Hex,
    blockNumber: log.blockNumber,
    logIndex: log.logIndex ?? 0,
    txHash: log.transactionHash,
  };
}

function hydrateContracts(logs: FreshExpressLog[]) {
  return logs.flatMap((L) => [
    { address: L.listing, abi: directListingAbi, functionName: 'startMcap' as const },
    { address: L.listing, abi: directListingAbi, functionName: 'totalSupply' as const },
    { address: L.listing, abi: directListingAbi, functionName: 'startPriceWad' as const },
    { address: L.listing, abi: directListingAbi, functionName: 'listed' as const },
    { address: L.listing, abi: directListingAbi, functionName: 'creatorReserve' as const },
    { address: L.listing, abi: directListingAbi, functionName: 'liquidityLocked' as const },
    { address: L.listing, abi: directListingAbi, functionName: 'createSidePool' as const },
    { address: L.listing, abi: directListingAbi, functionName: 'sidePoolBps' as const },
    { address: L.listing, abi: directListingAbi, functionName: 'sidePoolDeployed' as const },
    { address: L.listing, abi: directListingAbi, functionName: 'pairToken' as const },
    { address: L.listing, abi: directListingAbi, functionName: 'mainKey' as const },
    { address: L.listing, abi: directListingAbi, functionName: 'sideKey' as const },
    { address: L.listing, abi: directListingAbi, functionName: 'ethUsdWad' as const },
    { address: L.token, abi: launchTokenAbi, functionName: 'name' as const },
    { address: L.token, abi: launchTokenAbi, functionName: 'symbol' as const },
    { address: L.token, abi: launchTokenAbi, functionName: 'decimals' as const },
  ]);
}

const HYDRATE_STRIDE = 16;

async function hydrateBatch(
  client: PublicClient,
  logs: FreshExpressLog[],
): Promise<Array<ListingInsert | null>> {
  if (logs.length === 0) return [];
  const contracts = hydrateContracts(logs);
  let results: McResult[];
  try {
    results = (await client.multicall({ contracts, allowFailure: true })) as McResult[];
  } catch {
    results = [];
    for (const c of contracts) {
      try {
        const result = await client.readContract(c as never);
        results.push({ status: 'success', result });
      } catch {
        results.push({ status: 'failure' });
      }
    }
  }

  const out: Array<ListingInsert | null> = [];
  for (let i = 0; i < logs.length; i++) {
    const base = i * HYDRATE_STRIDE;
    const L = logs[i]!;
    const required = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13, 14, 15];
    const failed = required.some((idx) => results[base + idx]?.status !== 'success');
    if (failed) {
      out.push(null);
      continue;
    }
    const startMcap = results[base]!.result as bigint;
    const totalSupply = results[base + 1]!.result as bigint;
    const startPriceWad = results[base + 2]!.result as bigint;
    const listedSupply = results[base + 3]!.result as bigint;
    const creatorReserve = results[base + 4]!.result as bigint;
    const liquidityLocked = results[base + 5]!.result as boolean;
    const sidePoolBps = results[base + 7]!.result as number;
    const sidePoolDeployed = results[base + 8]!.result as boolean;
    const pairToken = results[base + 9]!.result as Address;
    const mainKey = results[base + 10]!.result as PoolKeyJson;
    const sideKeyRaw =
      results[base + 11]?.status === 'success'
        ? (results[base + 11]!.result as PoolKeyJson)
        : null;
    const ethUsdWad =
      results[base + 12]?.status === 'success'
        ? (results[base + 12]!.result as bigint)
        : null;
    const name = results[base + 13]!.result as string;
    const symbol = results[base + 14]!.result as string;
    const decimals = Number(results[base + 15]!.result as number);

    const pairIsToken0 = pairToken.toLowerCase() < L.token.toLowerCase();
    const mainPoolId = hexToBuffer(poolIdFromKey(mainKey));
    const sidePoolKey = sidePoolDeployed && sideKeyRaw ? sideKeyRaw : null;
    const sidePoolId = sidePoolKey ? hexToBuffer(poolIdFromKey(sidePoolKey)) : null;
    const pairDecimals = pairDecimalsForKey(mainKey, L.token);

    out.push({
      generation_id: 0,
      listing_address: L.listing,
      token_address: L.token,
      creator_address: L.creator,
      symbol,
      name,
      decimals,
      total_supply: totalSupply,
      listed_supply: listedSupply,
      side_pool_bps: sidePoolBps,
      creator_reserve: creatorReserve,
      liquidity_locked: liquidityLocked,
      start_mcap_usd: startMcap,
      start_price_wad: startPriceWad,
      eth_usd_wad_stamped: ethUsdWad,
      main_pool_id: mainPoolId,
      side_pool_id: sidePoolId,
      main_pool_key: mainKey,
      side_pool_key: sidePoolKey,
      pair_is_token0: pairIsToken0,
      token_decimals: decimals,
      pair_decimals: pairDecimals,
      launch_block: L.blockNumber,
      launch_tx: hexToBuffer(L.txHash),
      launched_at: new Date(0),
    });
  }
  return out;
}

export type ListingsScanResult = {
  listingsFound: number;
  blocksScanned: bigint;
  cursor: bigint;
};

export async function scanListingsForGeneration(
  chain: PublicClient,
  db: DbClient,
  generation: GenerationRow,
  head: bigint,
): Promise<ListingsScanResult> {
  assertExpressListedTopic0();
  const factory = normalizeAddress(generation.factory_address);
  const scope = LISTINGS_SCOPE(factory);
  const deployBlock = BigInt(generation.deploy_block);
  let cursor = await ensureCursor(db, scope, deployBlock - 1n);
  let listingsFound = 0;
  let blocksScanned = 0n;
  let chunk = START_CHUNK;
  let cleanStreak = 0;

  while (cursor < head) {
    const from = cursor + 1n;
    const to = from + chunk - 1n > head ? head : from + chunk - 1n;
    try {
      const logs = await chain.getLogs({
        address: factory,
        event: expressListedEvent,
        fromBlock: from,
        toBlock: to,
      });
      const fresh: FreshExpressLog[] = [];
      for (const log of logs) {
        const p = parseExpressLog(log as Log);
        if (p) fresh.push(p);
      }

      await withTransaction(async (tx) => {
        if (fresh.length > 0) {
          const blockTs = await fetchBlockTimestamps(
            chain,
            fresh.map((f) => f.blockNumber),
          );
          const hydrated = await hydrateBatch(chain, fresh);
          for (let i = 0; i < fresh.length; i++) {
            const row = hydrated[i];
            const log = fresh[i]!;
            if (!row) continue;
            if (await listingExists(tx, generation.id, log.listing)) continue;
            row.generation_id = generation.id;
            row.launched_at = blockTs.get(log.blockNumber.toString()) ?? new Date(0);
            const id = await insertListing(tx, row);
            if (id > 0) listingsFound += 1;
          }
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

  return { listingsFound, blocksScanned, cursor };
}
