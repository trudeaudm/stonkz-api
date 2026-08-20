import pg from 'pg';
import type { Pool } from 'pg';
import { EventEmitter } from 'node:events';
import { config } from '../../config/env.js';
import { logger } from '../../logger.js';
import { buildListingSummaries, listAllVisibleListings } from './read.js';
import { spotFromSwap, poolIdHex } from '../format.js';

export type PriceEvent = {
  type: 'price';
  token_address: string;
  listing_address: string;
  symbol: string | null;
  price_wad: string;
  pool_id: string;
  pool: 'main' | 'side';
  pair_currency: string;
  liquidity: string;
  block_number: string;
  block_time: string;
};

/**
 * One shared DB LISTEN + poll loop for all SSE clients.
 * Worker emits pg_notify('stonkz_swaps', …) on new indexed swaps.
 */
export class PricesHub extends EventEmitter {
  private listener: pg.Client | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastSeenId = 0n;
  private started = false;

  constructor(private readonly pool: Pool) {
    super();
    this.setMaxListeners(0);
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    const { rows } = await this.pool.query<{ max: string | null }>(
      `SELECT MAX(id)::text AS max FROM swaps`,
    );
    this.lastSeenId = BigInt(rows[0]?.max ?? 0);

    this.listener = new pg.Client({ connectionString: config.databaseUrl });
    await this.listener.connect();
    await this.listener.query('LISTEN stonkz_swaps');
    this.listener.on('notification', (msg) => {
      if (msg.channel !== 'stonkz_swaps') return;
      void this.refreshFromNotify(msg.payload);
    });
    this.listener.on('error', (err) => {
      logger.error({ err: err.message }, 'SSE LISTEN client error');
    });

    this.pollTimer = setInterval(() => {
      void this.pollNewSwaps();
    }, config.ssePollMs);

    logger.info({ lastSeenId: this.lastSeenId.toString() }, 'prices hub started');
  }

  async stop(): Promise<void> {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    if (this.listener) {
      try {
        await this.listener.query('UNLISTEN stonkz_swaps');
        await this.listener.end();
      } catch {
        /* ignore */
      }
      this.listener = null;
    }
    this.started = false;
  }

  private async refreshFromNotify(payload: string | undefined): Promise<void> {
    try {
      if (payload) {
        const data = JSON.parse(payload) as {
          listing_id: number;
          pool_id: string;
          is_main_pool: boolean;
          sqrt_price_x96: string;
          liquidity: string;
          block_number: string;
          block_time: string;
        };
        const { rows } = await this.pool.query<{
          token_address: string;
          listing_address: string;
          symbol: string | null;
          main_pool_key: import('../../types.js').PoolKeyJson;
          side_pool_key: import('../../types.js').PoolKeyJson | null;
          token_decimals: number;
          visible: boolean;
        }>(
          `SELECT l.token_address, l.listing_address, l.symbol,
                  l.main_pool_key, l.side_pool_key, l.token_decimals, g.visible
           FROM listings l
           JOIN generations g ON g.id = l.generation_id
           WHERE l.id = $1`,
          [data.listing_id],
        );
        const listing = rows[0];
        if (!listing || !listing.visible) return;
        const key = data.is_main_pool ? listing.main_pool_key : listing.side_pool_key;
        if (!key) return;
        const spot = spotFromSwap({
          sqrtPriceX96: data.sqrt_price_x96,
          liquidity: data.liquidity,
          tokenAddress: listing.token_address,
          key,
          tokenDecimals: listing.token_decimals,
          isMain: data.is_main_pool,
        });
        const ev: PriceEvent = {
          type: 'price',
          token_address: listing.token_address,
          listing_address: listing.listing_address,
          symbol: listing.symbol,
          price_wad: spot.priceWad,
          pool_id: data.pool_id.startsWith('0x') ? data.pool_id : `0x${data.pool_id}`,
          pool: data.is_main_pool ? 'main' : 'side',
          pair_currency: spot.pairCurrency,
          liquidity: spot.liquidity,
          block_number: data.block_number,
          block_time: data.block_time,
        };
        this.emit('price', ev);
        return;
      }
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'notify refresh failed — falling back to poll',
      );
    }
    await this.pollNewSwaps();
  }

  private async pollNewSwaps(): Promise<void> {
    try {
      const { rows } = await this.pool.query<{
        id: string;
        listing_id: number;
        pool_id: Buffer;
        is_main_pool: boolean;
        sqrt_price_x96: string;
        liquidity: string;
        block_number: string;
        block_time: Date;
        token_address: string;
        listing_address: string;
        symbol: string | null;
        main_pool_key: import('../../types.js').PoolKeyJson;
        side_pool_key: import('../../types.js').PoolKeyJson | null;
        token_decimals: number;
      }>(
        `SELECT s.id::text, s.listing_id, s.pool_id, s.is_main_pool,
                s.sqrt_price_x96::text, s.liquidity::text,
                s.block_number::text, s.block_time,
                l.token_address, l.listing_address, l.symbol,
                l.main_pool_key, l.side_pool_key, l.token_decimals
         FROM swaps s
         JOIN listings l ON l.id = s.listing_id
         JOIN generations g ON g.id = l.generation_id
         WHERE s.id > $1 AND g.visible = true
         ORDER BY s.id ASC
         LIMIT 100`,
        [this.lastSeenId.toString()],
      );
      for (const r of rows) {
        this.lastSeenId = BigInt(r.id);
        const key = r.is_main_pool ? r.main_pool_key : r.side_pool_key;
        if (!key) continue;
        const spot = spotFromSwap({
          sqrtPriceX96: r.sqrt_price_x96,
          liquidity: r.liquidity,
          tokenAddress: r.token_address,
          key,
          tokenDecimals: r.token_decimals,
          isMain: r.is_main_pool,
        });
        const ev: PriceEvent = {
          type: 'price',
          token_address: r.token_address,
          listing_address: r.listing_address,
          symbol: r.symbol,
          price_wad: spot.priceWad,
          pool_id: poolIdHex(r.pool_id),
          pool: r.is_main_pool ? 'main' : 'side',
          pair_currency: spot.pairCurrency,
          liquidity: spot.liquidity,
          block_number: r.block_number,
          block_time: r.block_time.toISOString(),
        };
        this.emit('price', ev);
      }
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'SSE poll failed',
      );
    }
  }

  /** Snapshot current spots for all visible listings (initial SSE bootstrap). */
  async snapshot(): Promise<PriceEvent[]> {
    const listings = await listAllVisibleListings(this.pool);
    const summaries = await buildListingSummaries(this.pool, listings);
    const out: PriceEvent[] = [];
    for (const s of summaries) {
      if (!s.spot.price_wad || !s.spot.pool_id || !s.spot.pool) continue;
      out.push({
        type: 'price',
        token_address: s.token_address,
        listing_address: s.listing_address,
        symbol: s.symbol,
        price_wad: s.spot.price_wad,
        pool_id: s.spot.pool_id,
        pool: s.spot.pool,
        pair_currency: s.spot.pair_currency ?? 'other',
        liquidity: s.spot.liquidity ?? '0',
        block_number: '0',
        block_time: s.spot.as_of ?? new Date().toISOString(),
      });
    }
    return out;
  }
}
