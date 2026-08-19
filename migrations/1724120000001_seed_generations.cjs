/**
 * Seed Express factory generations V1–V4.
 *
 * Source (read-only reference, not copied into this repo):
 *   C:\Users\david\stonkz\deploys\official\addresses.json
 *     → PoolManager 0x8366a39CC670B4001A1121B8F6A443A643e40951
 *     → StonkzFeeHook 0x4663c4c5Cb6F826d148cD38aDaF9157f483d0088
 *     → V4Adapter (official manifest) 0xA4b41704AdD5603DE6b9ffb4C29c2978C7c4469a
 *     → StonkzExpressFactory (official / V1) 0xdaA8C981c3ae077741ebA78283b6c5876EB727b4
 *
 * Per-generation factory addresses + deploy blocks from Robinhood Chain Blockscout
 * contract-creation API (2026-08-19). V2–V4 adapters resolved on-chain via
 * factory.poolManager(); V4 adapter differs (0x97F2…AF6C).
 *
 * All test generations: tracked=true, visible=false.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  const hook = '0x4663c4c5Cb6F826d148cD38aDaF9157f483d0088';
  const pm = '0x8366a39CC670B4001A1121B8F6A443A643e40951';
  const legacyAdapter = '0xA4b41704AdD5603DE6b9ffb4C29c2978C7c4469a';
  const v4Adapter = '0x97F2b8679E70962A56A56338f54A2073a37aAF6C';

  pgm.sql(`
    INSERT INTO generations (
      name, factory_address, adapter_address, pool_manager_address, hook_address,
      deploy_block, visible, tracked
    ) VALUES
      ('express-v1', '0xdaA8C981c3ae077741ebA78283b6c5876EB727b4', '${legacyAdapter}', '${pm}', '${hook}', 35168264, false, true),
      ('express-v2', '0x3eAb3d13e70BBEEB9e6203cBf11d6613523AC5Fd', '${legacyAdapter}', '${pm}', '${hook}', 37184159, false, true),
      ('express-v3', '0xb5105a1954e0f4045CB902606afB4178F471A338', '${legacyAdapter}', '${pm}', '${hook}', 37291899, false, true),
      ('express-v4', '0xEe2590c39E1485ed2F9cdaA684ab7B91d284E94a', '${v4Adapter}', '${pm}', '${hook}', 38007365, false, true)
    ON CONFLICT (name) DO NOTHING;
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql(`
    DELETE FROM generations
    WHERE name IN ('express-v1', 'express-v2', 'express-v3', 'express-v4');
  `);
};
