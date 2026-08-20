import type { Address, Hex, PublicClient } from 'viem';
import type { Pool } from 'pg';
import {
  directListingAbi,
  expressFactoryReadAbi,
  launchTokenAbi,
} from '../../chain/abis.js';
import { getChainClient } from '../../chain/client.js';
import {
  buildListingSummaries,
  latestSwapPerPool,
  type VisibleListingRow,
} from './read.js';
import { poolIdHex, spotFromSwap, txHashHex } from '../format.js';
import { absBig, tokenIsCurrency0 } from '../../lib/math.js';
import type { PoolKeyJson } from '../../types.js';

export type CreatorReserveStateJson = {
  mode: 'instant' | 'vest' | 'unknown';
  vest_duration_sec: string;
  unlocked_at: string;
  total: string;
  claimed: string;
  filed: boolean;
  available: string | null;
};

export async function fetchListingDetailExtras(
  listing: VisibleListingRow,
): Promise<{
  creator_reserve_state: CreatorReserveStateJson | null;
  side_pool_deployed: boolean | null;
  eth_usd_wad_live: string | null;
}> {
  const chain = getChainClient();
  let creator_reserve_state: CreatorReserveStateJson | null = null;
  let side_pool_deployed: boolean | null = null;
  let eth_usd_wad_live: string | null = null;

  try {
    const state = (await chain.readContract({
      address: listing.listing_address as Address,
      abi: directListingAbi,
      functionName: 'creatorReserveState',
    })) as {
      mode: number;
      vestDuration: bigint;
      unlockedAt: bigint;
      total: bigint;
      claimed: bigint;
      filed: boolean;
    };
    const mode = state.mode === 0 ? 'instant' : state.mode === 1 ? 'vest' : 'unknown';
    let available: string | null = null;
    try {
      // Approximate available using same rules as CreatorReserveLib (no claim call).
      const now = BigInt(Math.floor(Date.now() / 1000));
      if (state.total > 0n && state.unlockedAt > 0n) {
        if (mode === 'instant') {
          available =
            now >= state.unlockedAt
              ? (state.total - state.claimed).toString()
              : '0';
        } else if (mode === 'vest') {
          if (now < state.unlockedAt) available = '0';
          else {
            const elapsed = now - state.unlockedAt;
            const accrued =
              elapsed >= state.vestDuration
                ? state.total
                : (state.total * elapsed) / state.vestDuration;
            available = (accrued > state.claimed ? accrued - state.claimed : 0n).toString();
          }
        }
      } else {
        available = '0';
      }
    } catch {
      available = null;
    }
    creator_reserve_state = {
      mode,
      vest_duration_sec: state.vestDuration.toString(),
      unlocked_at: state.unlockedAt.toString(),
      total: state.total.toString(),
      claimed: state.claimed.toString(),
      filed: state.filed,
      available,
    };
  } catch {
    creator_reserve_state = null;
  }

  try {
    side_pool_deployed = await chain.readContract({
      address: listing.listing_address as Address,
      abi: directListingAbi,
      functionName: 'sidePoolDeployed',
    });
  } catch {
    side_pool_deployed = listing.side_pool_id != null;
  }

  try {
    // Prefer generation factory — look up via listing's generation factory from DB not available here;
    // ethUsdWad stamped is already on listing; live rate from any V4 factory is fine for display.
    // Read stamped on-chain ethUsdWad as fallback probe of listing; live from factory requires address.
    void eth_usd_wad_live;
  } catch {
    /* ignore */
  }

  return { creator_reserve_state, side_pool_deployed, eth_usd_wad_live };
}

export async function readLiveEthUsd(
  factoryAddress: string,
): Promise<string | null> {
  try {
    const chain = getChainClient();
    const wad = await chain.readContract({
      address: factoryAddress as Address,
      abi: expressFactoryReadAbi,
      functionName: 'currentEthUsdWad',
    });
    return wad.toString();
  } catch {
    return null;
  }
}

export async function buildListingDetail(
  db: Pool,
  listing: VisibleListingRow,
  factoryAddress: string,
): Promise<Record<string, unknown>> {
  const [summaries, perPool, extras, liveEth] = await Promise.all([
    buildListingSummaries(db, [listing]),
    latestSwapPerPool(db, listing.id),
    fetchListingDetailExtras(listing),
    readLiveEthUsd(factoryAddress),
  ]);
  const summary = summaries[0]!;

  const poolSpot = (
    swap: Awaited<ReturnType<typeof latestSwapPerPool>>['main'],
    key: PoolKeyJson | null,
    isMain: boolean,
  ) => {
    if (!swap || !key) {
      return {
        price_wad: null,
        liquidity: null,
        pool_id: isMain
          ? poolIdHex(listing.main_pool_id)
          : listing.side_pool_id
            ? poolIdHex(listing.side_pool_id)
            : null,
        as_of: null,
      };
    }
    const spot = spotFromSwap({
      sqrtPriceX96: swap.sqrt_price_x96,
      liquidity: swap.liquidity,
      tokenAddress: listing.token_address,
      key,
      tokenDecimals: listing.token_decimals,
      isMain,
    });
    return {
      price_wad: spot.priceWad,
      liquidity: spot.liquidity,
      pool_id: poolIdHex(swap.pool_id),
      as_of: swap.block_time.toISOString(),
      pair_currency: spot.pairCurrency,
    };
  };

  return {
    ...summary,
    creator_address: listing.creator_address,
    decimals: listing.decimals,
    start_price_wad: listing.start_price_wad,
    eth_usd_wad_stamped: listing.eth_usd_wad_stamped,
    eth_usd_wad_live: liveEth,
    creator_reserve: listing.creator_reserve,
    creator_reserve_state: extras.creator_reserve_state,
    side_pool_deployed: extras.side_pool_deployed,
    launch_tx: txHashHex(listing.launch_tx),
    main_pool_id: poolIdHex(listing.main_pool_id),
    side_pool_id: listing.side_pool_id ? poolIdHex(listing.side_pool_id) : null,
    main_pool_key: listing.main_pool_key,
    side_pool_key: listing.side_pool_key,
    pools: {
      main: poolSpot(perPool.main, listing.main_pool_key, true),
      side: poolSpot(perPool.side, listing.side_pool_key, false),
    },
  };
}

export type PositionJson = {
  token_address: string;
  listing_address: string;
  symbol: string | null;
  balance: string;
  cost_basis_usd: string | null;
  buy_tokens: string | null;
  buy_notional_usd: string | null;
  matched_swaps: number;
  partial: boolean;
};

function pairToUsd(
  paidPair: bigint,
  isMain: boolean,
  ethUsdWad: bigint | null,
): number | null {
  if (!isMain) return Number(paidPair) / 1e6;
  if (ethUsdWad == null || ethUsdWad <= 0n) return null;
  return (Number(paidPair) / 1e18) * (Number(ethUsdWad) / 1e18);
}

export async function walletPositions(
  db: Pool,
  listings: VisibleListingRow[],
  wallet: Address,
  factoryByGenerationId: Map<number, string>,
): Promise<PositionJson[]> {
  const chain = getChainClient();
  if (listings.length === 0) return [];

  const balances: bigint[] = [];
  try {
    const results = await chain.multicall({
      contracts: listings.map((l) => ({
        address: l.token_address as Address,
        abi: launchTokenAbi,
        functionName: 'balanceOf' as const,
        args: [wallet] as const,
      })),
      allowFailure: true,
    });
    for (const r of results) {
      balances.push(r.status === 'success' ? (r.result as bigint) : 0n);
    }
  } catch {
    for (const l of listings) {
      try {
        const bal = await chain.readContract({
          address: l.token_address as Address,
          abi: launchTokenAbi,
          functionName: 'balanceOf',
          args: [wallet],
        });
        balances.push(bal);
      } catch {
        balances.push(0n);
      }
    }
  }

  const ethUsdCache = new Map<string, bigint | null>();
  const out: PositionJson[] = [];

  for (let i = 0; i < listings.length; i++) {
    const listing = listings[i]!;
    const balance = balances[i] ?? 0n;
    if (balance === 0n) continue;

    const factory = factoryByGenerationId.get(listing.generation_id) ?? '';
    let ethUsd = ethUsdCache.get(factory) ?? null;
    if (!ethUsdCache.has(factory) && factory) {
      const live = await readLiveEthUsd(factory);
      ethUsd = live ? BigInt(live) : listing.eth_usd_wad_stamped
        ? BigInt(listing.eth_usd_wad_stamped)
        : null;
      ethUsdCache.set(factory, ethUsd);
    } else if (!factory && listing.eth_usd_wad_stamped) {
      ethUsd = BigInt(listing.eth_usd_wad_stamped);
    }

    const basis = await costBasisForListing(db, chain, listing, wallet, balance, ethUsd);
    out.push({
      token_address: listing.token_address,
      listing_address: listing.listing_address,
      symbol: listing.symbol,
      balance: balance.toString(),
      cost_basis_usd: basis?.avgCostUsd ?? null,
      buy_tokens: basis?.buyTokens ?? null,
      buy_notional_usd: basis?.buyNotionalUsd ?? null,
      matched_swaps: basis?.matchedSwaps ?? 0,
      partial: basis?.partial ?? true,
    });
  }
  return out;
}

async function costBasisForListing(
  db: Pool,
  chain: PublicClient,
  listing: VisibleListingRow,
  wallet: Address,
  balance: bigint,
  ethUsdWad: bigint | null,
): Promise<{
  avgCostUsd: string | null;
  buyTokens: string | null;
  buyNotionalUsd: string | null;
  matchedSwaps: number;
  partial: boolean;
} | null> {
  const { rows } = await db.query<{
    amount0: string;
    amount1: string;
    is_main_pool: boolean;
    swap_direction: 'buy' | 'sell' | null;
    tx_hash: Buffer;
    sender: string;
  }>(
    `SELECT amount0::text, amount1::text, is_main_pool, swap_direction, tx_hash, sender
     FROM swaps WHERE listing_id = $1
     ORDER BY block_number ASC, log_index ASC`,
    [listing.id],
  );
  if (rows.length === 0) {
    return { avgCostUsd: null, buyTokens: null, buyNotionalUsd: null, matchedSwaps: 0, partial: true };
  }

  const walletLc = wallet.toLowerCase();
  const needTx = [
    ...new Set(
      rows
        .filter((r) => r.sender.toLowerCase() !== walletLc)
        .map((r) => txHashHex(r.tx_hash)),
    ),
  ];
  const fromMap = new Map<string, string>();
  await Promise.all(
    needTx.map(async (hash) => {
      try {
        const tx = await chain.getTransaction({ hash: hash as Hex });
        fromMap.set(hash.toLowerCase(), tx.from.toLowerCase());
      } catch {
        /* skip */
      }
    }),
  );

  let buyTokens = 0n;
  let buyNotional = 0;
  let matched = 0;

  for (const r of rows) {
    const hash = txHashHex(r.tx_hash).toLowerCase();
    const mine =
      r.sender.toLowerCase() === walletLc || fromMap.get(hash) === walletLc;
    if (!mine) continue;
    matched += 1;

    const key = r.is_main_pool ? listing.main_pool_key : listing.side_pool_key;
    if (!key) continue;
    const tok0 = tokenIsCurrency0(key, listing.token_address as Address);
    const tokenDelta = tok0 ? BigInt(r.amount0) : BigInt(r.amount1);
    const pairDelta = tok0 ? BigInt(r.amount1) : BigInt(r.amount0);

    const isBuy = r.swap_direction === 'buy' || (r.swap_direction == null && tokenDelta > 0n);
    if (!isBuy) continue;

    const bought = absBig(tokenDelta);
    const paid = absBig(pairDelta);
    const usd = pairToUsd(paid, r.is_main_pool, ethUsdWad);
    if (usd == null || usd <= 0) continue;
    buyTokens += bought;
    buyNotional += usd;
  }

  if (buyTokens === 0n || buyNotional <= 0) {
    return {
      avgCostUsd: null,
      buyTokens: null,
      buyNotionalUsd: null,
      matchedSwaps: matched,
      partial: true,
    };
  }

  const explained = Number(buyTokens) / 1e18;
  const avg = buyNotional / explained;
  const balHuman = Number(balance) / 1e18;
  const partial = balHuman > explained * 1.01 + 1e-4;

  return {
    avgCostUsd: avg.toFixed(8),
    buyTokens: buyTokens.toString(),
    buyNotionalUsd: buyNotional.toFixed(8),
    matchedSwaps: matched,
    partial,
  };
}
