import { startApiServer } from './server.js';
import { logger } from '../logger.js';
import { closePool } from '../db/pool.js';

startApiServer().catch(async (err) => {
  logger.fatal({ err: err instanceof Error ? err.message : String(err) }, 'API crashed');
  await closePool();
  process.exit(1);
});
