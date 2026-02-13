/**
 * invariance_setup — One-time agent wallet + identity registration
 */

import { getInvariance, state } from '../index.js';
import { WalletStore } from '../wallet-store.js';

interface SetupParams {
  label?: string;
  capabilities?: string[];
}

interface SetupResult {
  address: string;
  identityId: string;
  label: string;
  capabilities: string[];
  isNewWallet: boolean;
  message: string;
}

/**
 * Set up the agent: create/load wallet and register on-chain identity.
 *
 * Idempotent — if already set up, returns existing identity info.
 */
export async function setup(params: SetupParams = {}): Promise<SetupResult> {
  const label = params.label ?? 'OpenClaw Agent';
  const capabilities = params.capabilities ?? ['swap', 'transfer'];

  // Check if already initialized
  if (state.agentIdentityId && state.agentAddress) {
    return {
      address: state.agentAddress,
      identityId: state.agentIdentityId,
      label,
      capabilities,
      isNewWallet: false,
      message: `Agent already set up at ${state.agentAddress}`,
    };
  }

  const inv = getInvariance();
  const address = inv.wallet.getAddress();

  // Check wallet status
  const password = process.env['INVARIANCE_WALLET_PASSWORD'] ?? '';
  const store = new WalletStore(password);
  const isNewWallet = !store.exists();

  // Register on-chain identity
  const agent = await inv.identity.register({
    type: 'agent',
    owner: address,
    label,
    capabilities,
  });

  state.agentIdentityId = agent.identityId;
  state.agentAddress = address;

  return {
    address,
    identityId: agent.identityId,
    label,
    capabilities,
    isNewWallet,
    message: isNewWallet
      ? `New wallet created at ${address}. Fund it with ETH for gas and USDC for trading on Base Sepolia.`
      : `Wallet loaded at ${address}. Agent identity registered on-chain.`,
  };
}
