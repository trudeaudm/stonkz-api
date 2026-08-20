/**
 * Add trader-facing swap_direction.
 *
 * Uniswap v4 PoolManager Swap amount0/amount1 are BalanceDelta-style for the
 * swap caller: positive token-side amount ⇒ caller is owed the launch token
 * (BUY); negative ⇒ caller owes the launch token (SELL). Verified against
 * MOONER main-pool Transfer receipts (PM → trader on buys).
 *
 * Matches stonkz-site app/prices/useMainPoolSpot.ts swapDirection().
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.addColumn('swaps', {
    swap_direction: { type: 'text', notNull: false },
  });
  pgm.sql(`
    COMMENT ON COLUMN swaps.swap_direction IS
      'Trader direction for the launch token: buy|sell. Derived from Swap event token-side BalanceDelta (positive = buy). Not pool inventory deltas.';
  `);
  pgm.sql(`
    ALTER TABLE swaps
      ADD CONSTRAINT swaps_direction_check
      CHECK (swap_direction IS NULL OR swap_direction IN ('buy', 'sell'));
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql(`ALTER TABLE swaps DROP CONSTRAINT IF EXISTS swaps_direction_check`);
  pgm.dropColumn('swaps', 'swap_direction');
};
