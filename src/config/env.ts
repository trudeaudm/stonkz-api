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

export const config = Object.freeze({
  chainId: parseChainId('CHAIN_ID'),
  rpcUrl: requireHttps('RPC_URL'),
  databaseUrl: requireEnv('DATABASE_URL'),
  confirmationBuffer: parseOptionalInt('CONFIRMATION_BUFFER', 5),
  pollIntervalMs: parseOptionalInt('POLL_INTERVAL_MS', 2000),
  logLevel: read('LOG_LEVEL') ?? 'info',
});
