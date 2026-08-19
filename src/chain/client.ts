import { createPublicClient, http, type PublicClient } from 'viem';
import { config } from '../config/env.js';

let client: PublicClient | null = null;

export function getChainClient(): PublicClient {
  if (!client) {
    client = createPublicClient({
      transport: http(config.rpcUrl),
    });
  }
  return client;
}
