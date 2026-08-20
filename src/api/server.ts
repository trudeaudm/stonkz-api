import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { Address } from 'viem';
import { config } from '../config/env.js';
import { getPool } from '../db/pool.js';
import { getChainClient } from '../chain/client.js';
import { resolveHead } from '../indexer/adaptiveLogs.js';
import { logger } from '../logger.js';
import { apiCache } from './cache.js';
import { ApiError, sendError, toPublicError } from './errors.js';
import { CANDLE_TIMEFRAMES, type CandleTimeframe } from '../types.js';
import { isAddressLike } from './format.js';
import {
  buildListingSummaries,
  getCandlesForActivePool,
  getRecentTrades,
  getVisibleListingByToken,
  healthSnapshot,
  listVisibleListings,
  listAllVisibleListings,
} from './services/read.js';
import { buildListingDetail, walletPositions } from './services/detail.js';
import { PricesHub } from './services/pricesHub.js';

export async function buildServer() {
  const pool = getPool();
  const hub = new PricesHub(pool);

  const app = Fastify({
    logger: false,
    trustProxy: true,
  });

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (config.corsOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    methods: ['GET', 'HEAD', 'OPTIONS'],
  });

  await app.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindowMs,
    errorResponseBuilder: () => ({
      error: { code: 'rate_limited', message: 'Too many requests' },
    }),
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'STONKZ Read API',
        description:
          'Public read API for indexed STONKZ listings, candles, trades, and SSE prices. ' +
          'All token/wei amounts are JSON strings (exceed JS number precision). ' +
          'Public endpoints filter generations.visible = true. /health includes hidden generations.',
        version: '0.2.0',
      },
      servers: [{ url: '/' }],
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  app.setErrorHandler((err, _req, reply) => {
    const pub = toPublicError(err);
    if (!(err instanceof ApiError)) {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        'request error',
      );
    }
    return sendError(reply, pub.statusCode, pub.code, pub.message);
  });

  app.get('/health', {
    schema: {
      description:
        'DB connectivity, worker cursor freshness, row counts. Includes hidden generations. TTL ~2s.',
      response: { 200: { type: 'object', additionalProperties: true } },
    },
  }, async (_req, reply) => {
    const body = await apiCache.getOrSet('health', config.cacheTtlHealthMs, async () => {
      let head: bigint | null = null;
      try {
        head = await resolveHead(getChainClient(), 0n);
      } catch {
        head = null;
      }
      return healthSnapshot(pool, head);
    });
    reply.header('Cache-Control', `public, max-age=${Math.floor(config.cacheTtlHealthMs / 1000)}`);
    return body;
  });

  app.get<{
    Querystring: { limit?: string; offset?: string };
  }>('/listings', {
    schema: {
      description:
        'Paginated visible listings, newest first. Spot/volume TTL ~3s; immutable fields may be longer-lived client-side.',
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'string' },
          offset: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const limit = Math.min(
      Math.max(Number.parseInt(req.query.limit ?? '', 10) || config.listingsDefaultLimit, 1),
      config.listingsMaxLimit,
    );
    const offset = Math.max(Number.parseInt(req.query.offset ?? '', 10) || 0, 0);
    const cacheKey = `listings:${limit}:${offset}`;
    const body = await apiCache.getOrSet(cacheKey, config.cacheTtlListingsMs, async () => {
      const { rows, total } = await listVisibleListings(pool, limit, offset);
      const items = await buildListingSummaries(pool, rows);
      return {
        items,
        pagination: { limit, offset, total },
        amounts: 'strings',
      };
    });
    reply.header('Cache-Control', `public, max-age=${Math.floor(config.cacheTtlListingsMs / 1000)}`);
    return body;
  });

  app.get<{ Params: { token: string } }>('/listings/:token', {
    schema: {
      description:
        'Full listing detail for a visible token. Live vesting/side-pool flags via RPC; facts TTL ~60s, spot ~3s.',
    },
  }, async (req, reply) => {
    const token = req.params.token;
    if (!isAddressLike(token)) throw new ApiError(400, 'bad_request', 'Invalid token address');
    const cacheKey = `listing:${token.toLowerCase()}`;
    const body = await apiCache.getOrSet(cacheKey, config.cacheTtlSpotMs, async () => {
      const listing = await getVisibleListingByToken(pool, token);
      if (!listing) throw new ApiError(404, 'not_found', 'Listing not found');
      const gen = await pool.query<{ factory_address: string }>(
        `SELECT factory_address FROM generations WHERE id = $1`,
        [listing.generation_id],
      );
      return buildListingDetail(pool, listing, gen.rows[0]?.factory_address ?? '');
    });
    reply.header('Cache-Control', `public, max-age=${Math.floor(config.cacheTtlSpotMs / 1000)}`);
    return body;
  });

  app.get<{
    Params: { token: string };
    Querystring: { timeframe?: string; from?: string; to?: string };
  }>('/listings/:token/candles', {
    schema: {
      description: `OHLC+volume for the ACTIVE (most recently traded) pool. Cap ${config.candlesMaxRows} rows/request. TTL ~5s.`,
    },
  }, async (req, reply) => {
    const token = req.params.token;
    if (!isAddressLike(token)) throw new ApiError(400, 'bad_request', 'Invalid token address');
    const tf = (req.query.timeframe ?? '1h') as CandleTimeframe;
    if (!CANDLE_TIMEFRAMES.includes(tf)) {
      throw new ApiError(400, 'bad_request', `timeframe must be one of ${CANDLE_TIMEFRAMES.join('|')}`);
    }
    let from: Date | null = null;
    let to: Date | null = null;
    if (req.query.from) {
      from = new Date(req.query.from);
      if (Number.isNaN(from.getTime())) throw new ApiError(400, 'bad_request', 'Invalid from');
    }
    if (req.query.to) {
      to = new Date(req.query.to);
      if (Number.isNaN(to.getTime())) throw new ApiError(400, 'bad_request', 'Invalid to');
    }
    const cacheKey = `candles:${token.toLowerCase()}:${tf}:${req.query.from ?? ''}:${req.query.to ?? ''}`;
    const body = await apiCache.getOrSet(cacheKey, config.cacheTtlCandlesMs, async () => {
      const listing = await getVisibleListingByToken(pool, token);
      if (!listing) throw new ApiError(404, 'not_found', 'Listing not found');
      const result = await getCandlesForActivePool(
        pool,
        listing,
        tf,
        from,
        to,
        config.candlesMaxRows,
      );
      return {
        token_address: listing.token_address,
        ...result,
        max_rows: config.candlesMaxRows,
        amounts: 'strings',
      };
    });
    reply.header('Cache-Control', `public, max-age=${Math.floor(config.cacheTtlCandlesMs / 1000)}`);
    return body;
  });

  app.get<{
    Params: { token: string };
    Querystring: { limit?: string };
  }>('/listings/:token/trades', {
    schema: {
      description:
        'Recent swaps newest-first. Direction is trader-perspective (buy|sell). TTL ~3s.',
    },
  }, async (req, reply) => {
    const token = req.params.token;
    if (!isAddressLike(token)) throw new ApiError(400, 'bad_request', 'Invalid token address');
    const limit = Math.min(
      Math.max(Number.parseInt(req.query.limit ?? '', 10) || config.tradesDefaultLimit, 1),
      config.tradesMaxLimit,
    );
    const cacheKey = `trades:${token.toLowerCase()}:${limit}`;
    const body = await apiCache.getOrSet(cacheKey, config.cacheTtlSpotMs, async () => {
      const listing = await getVisibleListingByToken(pool, token);
      if (!listing) throw new ApiError(404, 'not_found', 'Listing not found');
      const items = await getRecentTrades(pool, listing, limit);
      return { token_address: listing.token_address, items, amounts: 'strings' };
    });
    reply.header('Cache-Control', `public, max-age=${Math.floor(config.cacheTtlSpotMs / 1000)}`);
    return body;
  });

  app.get<{ Params: { address: string } }>('/wallets/:address/positions', {
    schema: {
      description:
        'Balances across visible listings with cost basis from indexed swaps. ' +
        'partial=true when balance is not fully explained by indexed buys. No cache (RPC).',
    },
  }, async (req) => {
    const address = req.params.address;
    if (!isAddressLike(address)) throw new ApiError(400, 'bad_request', 'Invalid wallet address');
    const listings = await listAllVisibleListings(pool);
    const gens = await pool.query<{ id: number; factory_address: string }>(
      `SELECT id, factory_address FROM generations WHERE visible = true`,
    );
    const factoryByGen = new Map(gens.rows.map((g) => [g.id, g.factory_address]));
    const positions = await walletPositions(
      pool,
      listings,
      address as Address,
      factoryByGen,
    );
    return {
      wallet: address.toLowerCase(),
      positions,
      amounts: 'strings',
    };
  });

  app.get('/stream/prices', {
    schema: {
      description:
        'SSE stream of spot updates for visible listings. One shared LISTEN/poll server-side. ' +
        'Heartbeat every ~15s (event: heartbeat). On disconnect, reconnect with exponential backoff; ' +
        're-fetch GET /listings for authoritative spot. Event id = block_number:pool_id.',
    },
  }, async (req, reply) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': req.headers.origin && config.corsOrigins.includes(req.headers.origin)
        ? req.headers.origin
        : config.corsOrigins[0] ?? '*',
    });
    res.write(': stonkz price stream\n\n');

    const writeEvent = (event: string, data: unknown, id?: string) => {
      if (id) res.write(`id: ${id}\n`);
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const snap = await hub.snapshot();
      writeEvent('snapshot', { prices: snap, amounts: 'strings' });
    } catch (err) {
      writeEvent('error', { message: 'snapshot failed' });
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'SSE snapshot failed');
    }

    const onPrice = (ev: unknown) => {
      const p = ev as { block_number: string; pool_id: string };
      writeEvent('price', ev, `${p.block_number}:${p.pool_id}`);
    };
    hub.on('price', onPrice);

    const heartbeat = setInterval(() => {
      writeEvent('heartbeat', { ts: new Date().toISOString() });
    }, config.sseHeartbeatMs);

    const cleanup = () => {
      clearInterval(heartbeat);
      hub.off('price', onPrice);
      try {
        res.end();
      } catch {
        /* ignore */
      }
    };
    req.raw.on('close', cleanup);
  });

  app.addHook('onClose', async () => {
    await hub.stop();
  });

  await hub.start();
  return { app, hub };
}

export async function startApiServer(): Promise<void> {
  const { app } = await buildServer();
  await app.listen({ port: config.port, host: config.host });
  logger.info(
    { port: config.port, host: config.host, cors: config.corsOrigins },
    'read API listening',
  );
}
