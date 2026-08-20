import { config as loadDotenv } from 'dotenv';

loadDotenv();

function read(name: string): string | undefined {
  const value = process.env[name];
  if (value == null || value === '') return undefined;
  return value;
}

function requireEnv(name: string): string {
  const value = read(name);
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function parseChainId(name: string): number {
  const value = requireEnv(name);
  const n = Number.parseInt(value, 10);
  if (!Number.isInteger(n) || n <= 0 || String(n) !== value.trim()) {
    throw new Error(`${name} must be a positive integer (got ${JSON.stringify(value)})`);
  }
  return n;
}

function requireHttps(name: string): string {
  const value = requireEnv(name);
  if (!value.startsWith('https://')) {
    throw new Error(`${name} must start with https:// (got ${JSON.stringify(value)})`);
  }
  return value;
}

function parseOptionalInt(name: string, fallback: number): number {
  const value = read(name);
  if (value == null) return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isInteger(n) || n < 0 || String(n) !== value.trim()) {
    throw new Error(`${name} must be a non-negative integer (got ${JSON.stringify(value)})`);
  }
  return n;
}

/** Comma-separated origins. Empty → reflect request origin in CORS (dev). */
function parseCorsOrigins(): string[] {
  const raw = read('CORS_ORIGINS') ?? 'https://stonkz.green,https://www.stonkz.green,https://stonkz.meme,http://localhost:3000';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config = Object.freeze({
  chainId: parseChainId('CHAIN_ID'),
  rpcUrl: requireHttps('RPC_URL'),
  databaseUrl: requireEnv('DATABASE_URL'),
  confirmationBuffer: parseOptionalInt('CONFIRMATION_BUFFER', 5),
  pollIntervalMs: parseOptionalInt('POLL_INTERVAL_MS', 2000),
  logLevel: read('LOG_LEVEL') ?? 'info',
  serviceName: read('SERVICE_NAME') ?? 'stonkz-api',

  // Read API (Step B)
  port: parseOptionalInt('PORT', 3080),
  host: read('HOST') ?? '0.0.0.0',
  corsOrigins: parseCorsOrigins(),
  rateLimitMax: parseOptionalInt('RATE_LIMIT_MAX', 120),
  rateLimitWindowMs: parseOptionalInt('RATE_LIMIT_WINDOW_MS', 60_000),
  cacheTtlSpotMs: parseOptionalInt('CACHE_TTL_SPOT_MS', 3_000),
  cacheTtlCandlesMs: parseOptionalInt('CACHE_TTL_CANDLES_MS', 5_000),
  cacheTtlListingsMs: parseOptionalInt('CACHE_TTL_LISTINGS_MS', 3_000),
  cacheTtlListingFactsMs: parseOptionalInt('CACHE_TTL_LISTING_FACTS_MS', 60_000),
  cacheTtlHealthMs: parseOptionalInt('CACHE_TTL_HEALTH_MS', 2_000),
  candlesMaxRows: parseOptionalInt('CANDLES_MAX_ROWS', 500),
  tradesDefaultLimit: parseOptionalInt('TRADES_DEFAULT_LIMIT', 50),
  tradesMaxLimit: parseOptionalInt('TRADES_MAX_LIMIT', 200),
  listingsDefaultLimit: parseOptionalInt('LISTINGS_DEFAULT_LIMIT', 50),
  listingsMaxLimit: parseOptionalInt('LISTINGS_MAX_LIMIT', 100),
  ssePollMs: parseOptionalInt('SSE_POLL_MS', 2_000),
  sseHeartbeatMs: parseOptionalInt('SSE_HEARTBEAT_MS', 15_000),
});
