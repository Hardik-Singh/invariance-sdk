/**
 * Step 1: Initialize the Invariance SDK
 *
 * Creates the SDK client using a private key and RPC URL from the environment.
 * The SDK connects to Base Sepolia and sets up the wallet for signing transactions.
 */

import { Invariance } from '@invariance/sdk';
import { privateKeyToAccount } from 'viem/accounts';
import { log } from '../utils/logger.js';

export interface InitResult {
  inv: Invariance;
  account: ReturnType<typeof privateKeyToAccount>;
}

export async function initSDK(): Promise<InitResult> {
  log.step(1, 'Initialize SDK');

  // Read configuration from environment
  const privateKey = process.env.PRIVATE_KEY;
  const rpcUrl = process.env.RPC_URL ?? 'https://sepolia.base.org';

  if (!privateKey) {
    throw new Error('PRIVATE_KEY is required. Copy .env.example to .env and fill in values.');
  }

  log.info('Deriving account from private key...');
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  log.data('Wallet address', account.address);

  // Create the Invariance client
  log.info('Connecting to Base Sepolia...');
  const inv = new Invariance({
    chain: 'base-sepolia',
    rpcUrl,
    signer: account,
  });

  // Wait for wallet initialization to complete
  await inv.ensureWalletInit();

  log.success('SDK initialized');
  log.data('Chain', 'base-sepolia');
  log.data('RPC', rpcUrl);
  log.data('SDK version', inv.version);

  return { inv, account };
}
