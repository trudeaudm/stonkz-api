/**
 * Core schema for the STONKZ API indexer (Step A).
 * Contract addresses for generations come from seed data citing
 * stonkz.green deploys/official/addresses.json + on-chain factory wiring.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql('CREATE EXTENSION IF NOT EXISTS citext');

  pgm.createTable('generations', {
    id: 'id',
    name: { type: 'text', notNull: true, unique: true },
    factory_address: { type: 'citext', notNull: true, unique: true },
    adapter_address: { type: 'citext', notNull: true },
    pool_manager_address: { type: 'citext', notNull: true },
    hook_address: { type: 'citext', notNull: true },
    deploy_block: { type: 'bigint', notNull: true },
    visible: { type: 'boolean', notNull: true, default: false },
    tracked: { type: 'boolean', notNull: true, default: true },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  pgm.createTable('listings', {
    id: 'id',
    generation_id: {
      type: 'integer',
      notNull: true,
      references: 'generations(id)',
      onDelete: 'CASCADE',
    },
    listing_address: { type: 'citext', notNull: true },
    token_address: { type: 'citext', notNull: true, unique: true },
    creator_address: { type: 'citext', notNull: true },
    symbol: { type: 'text' },
    name: { type: 'text' },
    decimals: { type: 'integer' },
    total_supply: { type: 'numeric(78,0)' },
    listed_supply: { type: 'numeric(78,0)' },
    side_pool_bps: { type: 'integer' },
    creator_reserve: { type: 'numeric(78,0)' },
    liquidity_locked: { type: 'boolean' },
    start_mcap_usd: { type: 'numeric' },
    start_price_wad: { type: 'numeric(78,0)' },
    eth_usd_wad_stamped: { type: 'numeric(78,0)' },
    main_pool_id: { type: 'bytea', notNull: true },
    side_pool_id: { type: 'bytea' },
    main_pool_key: { type: 'jsonb', notNull: true },
    side_pool_key: { type: 'jsonb' },
    /** true when pair currency sorts before token in PoolKey (pair is currency0). */
    pair_is_token0: { type: 'boolean', notNull: true },
    token_decimals: { type: 'integer', notNull: true, default: 18 },
    pair_decimals: { type: 'integer', notNull: true, default: 18 },
    launch_block: { type: 'bigint', notNull: true },
    launch_tx: { type: 'bytea', notNull: true },
    launched_at: { type: 'timestamptz', notNull: true },
  });
  pgm.addConstraint('listings', 'listings_generation_listing_unique', {
    unique: ['generation_id', 'listing_address'],
  });
  pgm.createIndex('listings', ['generation_id', { name: 'launch_block', sort: 'DESC' }]);

  pgm.createTable('swaps', {
    id: { type: 'bigserial', primaryKey: true },
    pool_id: { type: 'bytea', notNull: true },
    listing_id: {
      type: 'integer',
      notNull: true,
      references: 'listings(id)',
      onDelete: 'CASCADE',
    },
    is_main_pool: { type: 'boolean', notNull: true },
    block_number: { type: 'bigint', notNull: true },
    block_time: { type: 'timestamptz', notNull: true },
    tx_hash: { type: 'bytea', notNull: true },
    log_index: { type: 'integer', notNull: true },
    sender: { type: 'citext', notNull: true },
    amount0: { type: 'numeric(78,0)', notNull: true },
    amount1: { type: 'numeric(78,0)', notNull: true },
    sqrt_price_x96: { type: 'numeric(78,0)', notNull: true },
    tick: { type: 'integer', notNull: true },
    liquidity: { type: 'numeric(78,0)', notNull: true },
  });
  pgm.addConstraint('swaps', 'swaps_tx_log_unique', {
    unique: ['tx_hash', 'log_index'],
  });
  pgm.createIndex('swaps', ['pool_id', { name: 'block_number', sort: 'DESC' }]);
  pgm.sql(`
    COMMENT ON TABLE swaps IS
      'Amounts come from the PoolManager Swap EVENT ONLY. ERC-20 Transfer amounts describe the SAME movement and must never be summed with these. amount0/amount1 are v4 BalanceDelta for the swap caller: positive token-side = trader BUY.';
  `);

  pgm.createTable('candles', {
    pool_id: { type: 'bytea', notNull: true },
    timeframe: { type: 'text', notNull: true },
    bucket_start: { type: 'timestamptz', notNull: true },
    open: { type: 'numeric(78,0)', notNull: true },
    high: { type: 'numeric(78,0)', notNull: true },
    low: { type: 'numeric(78,0)', notNull: true },
    close: { type: 'numeric(78,0)', notNull: true },
    volume_pair: { type: 'numeric(78,0)', notNull: true, default: 0 },
    swap_count: { type: 'integer', notNull: true, default: 0 },
  });
  pgm.addConstraint('candles', 'candles_pk', {
    primaryKey: ['pool_id', 'timeframe', 'bucket_start'],
  });

  pgm.createTable('token_metadata', {
    token_address: {
      type: 'citext',
      primaryKey: true,
      references: 'listings(token_address)',
      onDelete: 'CASCADE',
    },
    description: { type: 'text' },
    image_url: { type: 'text' },
    image_content_hash: { type: 'text' },
    links: { type: 'jsonb' },
    updated_at: { type: 'timestamptz' },
    updated_by: { type: 'citext' },
  });

  pgm.createTable('indexer_cursors', {
    scope: { type: 'text', primaryKey: true },
    last_block: { type: 'bigint', notNull: true },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });
  pgm.sql(`
    COMMENT ON TABLE indexer_cursors IS
      'INVARIANT: last_block advances ONLY after the batch rows are committed. Any error leaves the cursor where it was.';
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable('indexer_cursors');
  pgm.dropTable('token_metadata');
  pgm.dropTable('candles');
  pgm.dropTable('swaps');
  pgm.dropTable('listings');
  pgm.dropTable('generations');
};
