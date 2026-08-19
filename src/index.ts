import { runWorker } from './indexer/worker.js';
import { logger } from './logger.js';
import { closePool } from './db/pool.js';

runWorker().catch(async (err) => {
  logger.fatal({ err: err instanceof Error ? err.message : String(err) }, 'worker crashed');
  await closePool();
  process.exit(1);
});
