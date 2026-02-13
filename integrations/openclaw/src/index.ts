/**
 * Invariance OpenClaw Skill — Entry Point
 *
 * Provides a singleton Invariance SDK instance and exports all tool handlers.
 * The SDK is lazily initialized on first tool invocation.
 */

import { Invariance } from '@invariance/sdk';
import { WalletStore } from './wallet-store.js';

export { setup } from './tools/setup.js';
export { setPolicy, viewPolicy } from './tools/policy.js';
export { trade } from './tools/trade.js';
export { verifyTx } from './tools/verify.js';
export { status } from './tools/status.js';

/** Skill-wide state */
interface SkillState {
  inv: Invariance | null;
  agentIdentityId: string | null;
  agentAddress: string | null;
  activePolicyId: string | null;
}

export const state: SkillState = {
  inv: null,
  agentIdentityId: null,
  agentAddress: null,
  activePolicyId: null,
};

/**
 * Get or initialize the Invariance SDK singleton.
 * Uses environment variables for configuration (see .env.example).
 */
export function getInvariance(): Invariance {
  if (state.inv) return state.inv;

  const password = process.env['INVARIANCE_WALLET_PASSWORD'];
  if (!password) {
    throw new Error(
      'INVARIANCE_WALLET_PASSWORD is required. Set it in your .env file to encrypt/decrypt the agent wallet.',
    );
  }

  const store = new WalletStore(password);
  const { account } = store.loadOrCreate();

  state.inv = new Invariance({
    chain: (process.env['INVARIANCE_CHAIN'] as 'base' | 'base-sepolia') ?? 'base-sepolia',
    rpcUrl: process.env['INVARIANCE_RPC_URL'] ?? 'https://sepolia.base.org',
    signer: account,
  });

  state.agentAddress = account.address;
  return state.inv;
}
