import type { Address, Hex } from 'viem';

export type PoolKeyJson = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
};

export type GenerationRow = {
  id: number;
  name: string;
  factory_address: string;
  adapter_address: string;
  pool_manager_address: string;
  hook_address: string;
  deploy_block: string;
  visible: boolean;
  tracked: boolean;
};

export type ListingRow = {
  id: number;
  generation_id: number;
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

export type SwapInsert = {
  pool_id: Buffer;
  listing_id: number;
  is_main_pool: boolean;
  block_number: bigint;
  block_time: Date;
  tx_hash: Buffer;
  log_index: number;
  sender: string;
  amount0: bigint;
  amount1: bigint;
  sqrt_price_x96: bigint;
  tick: number;
  liquidity: bigint;
  price_wad: bigint;
  pair_volume: bigint;
};

export type CandleTimeframe = '1m' | '5m' | '1h' | '4h' | '1d';

export const CANDLE_TIMEFRAMES: readonly CandleTimeframe[] = [
  '1m',
  '5m',
  '1h',
  '4h',
  '1d',
] as const;

export type IndexCycleSummary = {
  generation: string;
  blocksScanned: string;
  listingsFound: number;
  swapsFound: number;
  candlesUpserted: number;
  cursorScopes: Record<string, string>;
};

export type FreshExpressLog = {
  listing: Address;
  token: Address;
  creator: Address;
  userSalt: Hex;
  salt: Hex;
  blockNumber: bigint;
  logIndex: number;
  txHash: Hex;
};

export type DecodedSwap = {
  blockNumber: bigint;
  logIndex: number;
  txHash: Hex;
  sender: Address;
  amount0: bigint;
  amount1: bigint;
  sqrtPriceX96: bigint;
  liquidity: bigint;
  tick: number;
};

export const LISTINGS_SCOPE = (factory: string): string =>
  `listings:${factory.toLowerCase()}`;

export const SWAPS_SCOPE = (poolIdHex: Hex): string =>
  `swaps:${poolIdHex.toLowerCase()}`;
