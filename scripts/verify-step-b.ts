/**
 * Step B verification: embedded Postgres + live RPC backfill + read API probes.
 * Writes docs/step-b-verify.md with example responses, timings, SSE proof.
 */
import EmbeddedPostgres from 'embedded-postgres';
import { execSync, spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { setTimeout as sleep } from 'node:timers/promises';

const MOONER = '0x46639f9c43a688f185c83254564a6d743a27ce36';
const DEPLOYER = '0x8F5077eC52543d6393F483dC2B958Bf8Cad2d232';
const TIMEFRAMES = ['1m', '5m', '1h', '4h', '1d'] as const;
const API_PORT = 3099;

type Capture = Record<string, unknown>;

async function fetchJson(
  path: string,
  base = `http://127.0.0.1:${API_PORT}`,
): Promise<{ status: number; ms: number; body: unknown }> {
  const t0 = performance.now();
  const res = await fetch(`${base}${path}`);
  const ms = performance.now() - t0;
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* keep text */
  }
  return { status: res.status, ms, body };
}

async function main() {
  if (!process.env.NODE_TLS_REJECT_UNAUTHORIZED) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  }

  const dataDir = mkdtempSync(join(tmpdir(), 'stonkz-api-stepb-'));
  const emb = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port: 54332,
    persistent: false,
  });

  console.log('starting embedded postgres…');
  await emb.initialise();
  await emb.start();
  await emb.createDatabase('stonkz_api');

  const databaseUrl = 'postgres://postgres:postgres@127.0.0.1:54332/stonkz_api';
  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    CHAIN_ID: '4663',
    RPC_URL: 'https://rpc.mainnet.chain.robinhood.com',
    NODE_TLS_REJECT_UNAUTHORIZED: '0',
    PORT: String(API_PORT),
    HOST: '127.0.0.1',
    SERVICE_NAME: 'stonkz-api-web-verify',
    CORS_ORIGINS: 'http://localhost:3000,https://stonkz.green',
    LOG_LEVEL: 'warn',
  };

  execSync('npm run migrate', { stdio: 'inherit', env });
  console.log('\n=== backfill express-v4 ===');
  execSync('npm run backfill -- --generation express-v4', { stdio: 'inherit', env });

  // Rebuild candles with correct per-pool orientation (side = USDG 6 dec).
  console.log('\n=== rebuild candles for indexed pools ===');
  const rebuildDb = new pg.Client({ connectionString: databaseUrl });
  await rebuildDb.connect();
  const pools = await rebuildDb.query<{ pool: Buffer; token: string }>(
    `SELECT DISTINCT pool_id AS pool, l.token_address AS token
     FROM swaps s JOIN listings l ON l.id = s.listing_id`,
  );
  for (const p of pools.rows) {
    const hex = `0x${p.pool.toString('hex')}`;
    execSync(`npm run rebuild-candles -- --pool ${hex}`, { stdio: 'inherit', env });
  }
  await rebuildDb.end();

  const db = new pg.Client({ connectionString: databaseUrl });
  await db.connect();

  const report: Capture = {
    title: 'STONKZ API — Step B verify',
    at: new Date().toISOString(),
    stack: 'Fastify (typed schemas, lower JSON overhead, first-class async; Express would work but Fastify fits a public read API better)',
  };

  // Start API
  const child = spawn('npx', ['tsx', 'src/api/index.ts'], {
    env,
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });
  let apiReady = false;
  child.stdout?.on('data', (b) => {
    const s = b.toString();
    process.stdout.write(s);
    if (s.includes('listening')) apiReady = true;
  });
  child.stderr?.on('data', (b) => process.stderr.write(b));

  for (let i = 0; i < 40 && !apiReady; i++) await sleep(500);
  // health probe even if log line missed
  for (let i = 0; i < 20; i++) {
    try {
      const h = await fetchJson('/health');
      if (h.status === 200) {
        apiReady = true;
        break;
      }
    } catch {
      await sleep(500);
    }
  }
  if (!apiReady) throw new Error('API failed to start');

  // --- Hidden generation check ---
  const hiddenListings = await fetchJson('/listings');
  const hiddenMooner = await fetchJson(`/listings/${MOONER}`);
  const healthHidden = await fetchJson('/health');
  const healthBody = healthHidden.body as {
    generations?: Array<{ name: string; visible: boolean }>;
    counts?: { generations_hidden?: number };
  };
  report.hidden_filter = {
    listings_status: hiddenListings.status,
    listings_total: (hiddenListings.body as { pagination?: { total?: number } })?.pagination?.total,
    mooner_status: hiddenMooner.status,
    health_generations: healthBody.generations,
    generations_hidden: healthBody.counts?.generations_hidden,
    pass:
      hiddenListings.status === 200 &&
      (hiddenListings.body as { pagination?: { total?: number } })?.pagination?.total === 0 &&
      hiddenMooner.status === 404 &&
      (healthBody.counts?.generations_hidden ?? 0) >= 4,
  };

  // Make express-v4 visible for public endpoint demos
  await db.query(`UPDATE generations SET visible = true WHERE name = 'express-v4'`);
  // bust any cache by restarting... or wait TTL. Clear by restarting child is heavy;
  // cache is in-process — wait > TTL or hit unique query. Health cache 2s; listings 3s.
  await sleep(3500);

  const health = await fetchJson('/health');
  report.health = { status: health.status, ms: Math.round(health.ms), body: health.body };

  const listings = await fetchJson('/listings?limit=5');
  report.listings = {
    status: listings.status,
    ms: Math.round(listings.ms),
    body: listings.body,
  };

  // warm + timed listings
  await fetchJson('/listings?limit=5');
  const listingsTimed = await fetchJson('/listings?limit=5');
  report.timings = {
    listings_ms: Math.round(listingsTimed.ms),
  };

  const detail = await fetchJson(`/listings/${MOONER}`);
  report.listing_detail = { status: detail.status, ms: Math.round(detail.ms), body: detail.body };

  const candles: Record<string, unknown> = {};
  for (const tf of TIMEFRAMES) {
    const r = await fetchJson(`/listings/${MOONER}/candles?timeframe=${tf}`);
    candles[tf] = {
      status: r.status,
      ms: Math.round(r.ms),
      candle_count: (r.body as { candles?: unknown[] })?.candles?.length,
      pool: (r.body as { pool?: string; pool_id?: string })?.pool,
      pool_id: (r.body as { pool_id?: string })?.pool_id,
      sample: ((r.body as { candles?: unknown[] })?.candles ?? []).slice(0, 2),
      truncated: (r.body as { truncated?: boolean })?.truncated,
      max_rows: (r.body as { max_rows?: number })?.max_rows,
    };
  }
  const candles1d = await fetchJson(`/listings/${MOONER}/candles?timeframe=1d`);
  report.timings = {
    ...((report.timings as object) ?? {}),
    candles_1d_ms: Math.round(candles1d.ms),
  };
  report.mooner_candles = candles;

  const trades = await fetchJson(`/listings/${MOONER}/trades?limit=5`);
  report.trades = { status: trades.status, ms: Math.round(trades.ms), body: trades.body };

  const positions = await fetchJson(`/wallets/${DEPLOYER}/positions`);
  report.deployer_positions = {
    status: positions.status,
    ms: Math.round(positions.ms),
    body: positions.body,
  };

  // Visible generation now appears
  const visibleListings = await fetchJson('/listings');
  report.visible_after_flip = {
    total: (visibleListings.body as { pagination?: { total?: number } })?.pagination?.total,
    symbols: ((visibleListings.body as { items?: Array<{ symbol?: string }> })?.items ?? []).map(
      (i) => i.symbol,
    ),
  };

  // --- SSE proof ---
  const sseProof: Capture = { events: [] as unknown[] };
  try {
    await new Promise<void>((resolve, reject) => {
      const ac = new AbortController();
      const timer = setTimeout(() => {
        ac.abort();
        reject(new Error('SSE timeout'));
      }, 20_000);

      (async () => {
        try {
          const res = await fetch(`http://127.0.0.1:${API_PORT}/stream/prices`, {
            headers: { Accept: 'text/event-stream' },
            signal: ac.signal,
          });
          if (!res.ok || !res.body) throw new Error(`SSE HTTP ${res.status}`);
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buf = '';
          let gotSnapshot = false;
          let gotPrice = false;

          const simTimer = setTimeout(async () => {
            try {
              const listing = await db.query<{
                id: number;
                main_pool_id: Buffer;
              }>(`SELECT id, main_pool_id FROM listings WHERE lower(token_address)=lower($1)`, [
                MOONER,
              ]);
              const L = listing.rows[0];
              if (!L) throw new Error('MOONER missing for SSE sim');
              const last = await db.query<{
                sqrt_price_x96: string;
                liquidity: string;
                amount0: string;
                amount1: string;
                tick: number;
              }>(
                `SELECT sqrt_price_x96::text, liquidity::text, amount0::text, amount1::text, tick
                 FROM swaps WHERE listing_id=$1 AND is_main_pool=true
                 ORDER BY id DESC LIMIT 1`,
                [L.id],
              );
              const s = last.rows[0];
              if (!s) throw new Error('no main-pool swap for SSE sim');
              const sqrt = (BigInt(s.sqrt_price_x96) * 10001n) / 10000n;
              await db.query('BEGIN');
              const ins = await db.query<{ id: string }>(
                `INSERT INTO swaps (
                   pool_id, listing_id, is_main_pool, block_number, block_time,
                   tx_hash, log_index, sender, amount0, amount1,
                   sqrt_price_x96, tick, liquidity, swap_direction
                 ) VALUES (
                   $1,$2,true,
                   (SELECT COALESCE(MAX(block_number),0)+1 FROM swaps WHERE listing_id=$2),
                   now(),
                   decode(md5(random()::text || clock_timestamp()::text), 'hex'),
                   999001, '0x0000000000000000000000000000000000000001',
                   $3,$4,$5,$6,$7,'buy'
                 ) RETURNING id::text`,
                [
                  L.main_pool_id,
                  L.id,
                  s.amount0,
                  s.amount1,
                  sqrt.toString(),
                  s.tick,
                  s.liquidity,
                ],
              );
              await db.query(`SELECT pg_notify('stonkz_swaps', $1)`, [
                JSON.stringify({
                  listing_id: L.id,
                  pool_id: `0x${L.main_pool_id.toString('hex')}`,
                  is_main_pool: true,
                  sqrt_price_x96: sqrt.toString(),
                  liquidity: s.liquidity,
                  block_number: '99999999',
                  block_time: new Date().toISOString(),
                  swap_direction: 'buy',
                }),
              ]);
              await db.query('COMMIT');
              sseProof.simulated_swap_id = ins.rows[0]?.id;
            } catch (e) {
              await db.query('ROLLBACK').catch(() => undefined);
              sseProof.simulate_error = e instanceof Error ? e.message : String(e);
            }
          }, 800);

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const parts = buf.split('\n\n');
            buf = parts.pop() ?? '';
            for (const part of parts) {
              const lines = part.split('\n');
              let event = 'message';
              let data = '';
              for (const line of lines) {
                if (line.startsWith('event:')) event = line.slice(6).trim();
                if (line.startsWith('data:')) data += line.slice(5).trim();
              }
              if (!data && event === 'message') continue;
              let parsed: unknown = data;
              try {
                parsed = JSON.parse(data);
              } catch {
                /* keep */
              }
              (sseProof.events as unknown[]).push({ event, data: parsed });
              if (event === 'snapshot') gotSnapshot = true;
              if (event === 'price') gotPrice = true;
              if (gotSnapshot && gotPrice) {
                clearTimeout(simTimer);
                clearTimeout(timer);
                ac.abort();
                sseProof.pass = true;
                sseProof.got_snapshot = gotSnapshot;
                sseProof.got_price = gotPrice;
                sseProof.price_payload = (
                  sseProof.events as Array<{ event: string; data: unknown }>
                ).find((e) => e.event === 'price')?.data;
                resolve();
                return;
              }
            }
          }
          clearTimeout(simTimer);
          clearTimeout(timer);
          reject(new Error('SSE stream ended early'));
        } catch (e) {
          if ((e as Error).name === 'AbortError' && sseProof.pass) resolve();
          else reject(e);
        }
      })().catch(reject);
    });
  } catch (e) {
    sseProof.pass = false;
    sseProof.error = e instanceof Error ? e.message : String(e);
  }
  report.sse = sseProof;

  // Restore note: seed stays visible=false; verify flipped express-v4 for demos
  report.notes = [
    'Amounts are JSON strings throughout.',
    'Public endpoints filter generations.visible = true.',
    '/health includes all generations (hidden + visible).',
    'Candles capped at CANDLES_MAX_ROWS (default 500).',
    'SSE: shared LISTEN stonkz_swaps + poll; heartbeat ~15s; reconnect with backoff and re-GET /listings.',
  ];

  mkdirSync('docs', { recursive: true });
  const md = renderMarkdown(report);
  writeFileSync('docs/step-b-verify.md', md, 'utf8');
  writeFileSync('docs/step-b-verify.json', JSON.stringify(report, null, 2), 'utf8');
  console.log('\nWrote docs/step-b-verify.md');

  const fail =
    !(report.hidden_filter as { pass?: boolean }).pass ||
    !(report.sse as { pass?: boolean }).pass ||
    (report.listing_detail as { status?: number }).status !== 200;
  if (fail) {
    console.error('VERIFY FAILED', {
      hidden: report.hidden_filter,
      sse: report.sse,
      detail: (report.listing_detail as { status?: number }).status,
    });
    process.exitCode = 1;
  } else {
    console.log('VERIFY OK');
  }

  // Tear down API child tree first, then DB.
  try {
    if (process.platform === 'win32' && child.pid) {
      execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
  } catch {
    /* ignore */
  }
  await sleep(800);
  try {
    await db.end();
  } catch {
    /* ignore */
  }
  try {
    await emb.stop();
  } catch {
    /* ignore */
  }
}

function renderMarkdown(report: Capture): string {
  const lines: string[] = [];
  lines.push('# STONKZ API — Step B verify report');
  lines.push('');
  lines.push(`Generated: ${report.at}`);
  lines.push('');
  lines.push(`## Stack choice`);
  lines.push('');
  lines.push(String(report.stack));
  lines.push('');
  lines.push('## Hidden generation filter');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(report.hidden_filter, null, 2));
  lines.push('```');
  lines.push('');
  lines.push('## Timings');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(report.timings, null, 2));
  lines.push('```');
  lines.push('');
  lines.push('## GET /health (excerpt)');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify({ status: (report.health as Capture)?.status, ms: (report.health as Capture)?.ms, body: summarizeHealth((report.health as Capture)?.body) }, null, 2));
  lines.push('```');
  lines.push('');
  lines.push('## GET /listings');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(report.listings, null, 2));
  lines.push('```');
  lines.push('');
  lines.push('## GET /listings/:token ($MOONER)');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(report.listing_detail, null, 2));
  lines.push('```');
  lines.push('');
  lines.push('## GET /listings/:token/candles ($MOONER, each timeframe)');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(report.mooner_candles, null, 2));
  lines.push('```');
  lines.push('');
  lines.push('## GET /listings/:token/trades');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(report.trades, null, 2));
  lines.push('```');
  lines.push('');
  lines.push('## GET /wallets/:address/positions (deployer)');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(report.deployer_positions, null, 2));
  lines.push('```');
  lines.push('');
  lines.push('## SSE /stream/prices');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(report.sse, null, 2));
  lines.push('```');
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  for (const n of (report.notes as string[]) ?? []) lines.push(`- ${n}`);
  lines.push('');
  return lines.join('\n');
}

function summarizeHealth(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const b = body as Record<string, unknown>;
  return {
    ok: b.ok,
    db: b.db,
    chain_head: b.chain_head,
    blocks_behind_head: b.blocks_behind_head,
    counts: b.counts,
    generations: b.generations,
    cursors_sample: Array.isArray(b.cursors) ? (b.cursors as unknown[]).slice(0, 3) : b.cursors,
  };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
