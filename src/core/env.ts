import dotenv from 'dotenv';
import { privateKeyToAccount } from 'viem/accounts';
import type { InvarianceConfig } from '@invariance/common';

dotenv.config();

const VALID_CHAINS = ['base', 'base-sepolia'] as const;

/**
 * Load SDK configuration from environment variables.
 *
 * Supported variables:
 * - `INVARIANCE_PRIVATE_KEY` — hex private key, converted to a viem account signer
 * - `INVARIANCE_RPC_URL` — JSON-RPC endpoint
 * - `INVARIANCE_CHAIN` — `"base"` or `"base-sepolia"`
 * - `INVARIANCE_API_KEY` — managed-mode API key
 *
 * Only fields with a corresponding env var present are included in the
 * returned partial config.
 */
export function loadEnvConfig(): Partial<InvarianceConfig> {
  const config: Partial<InvarianceConfig> = {};

  const privateKey = process.env['INVARIANCE_PRIVATE_KEY'];
  if (privateKey) {
    const key = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    config.signer = privateKeyToAccount(key as `0x${string}`);
  }

  const rpcUrl = process.env['INVARIANCE_RPC_URL'];
  if (rpcUrl) {
    config.rpcUrl = rpcUrl;
  }

  const chain = process.env['INVARIANCE_CHAIN'];
  if (chain) {
    if (!VALID_CHAINS.includes(chain as (typeof VALID_CHAINS)[number])) {
      throw new Error(
        `Invalid INVARIANCE_CHAIN="${chain}". Must be one of: ${VALID_CHAINS.join(', ')}`,
      );
    }
    config.chain = chain as 'base' | 'base-sepolia';
  }

  const apiKey = process.env['INVARIANCE_API_KEY'];
  if (apiKey) {
    config.apiKey = apiKey;
  }

  return config;
}
