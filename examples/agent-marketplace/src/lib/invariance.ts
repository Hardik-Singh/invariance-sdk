/**
 * Invariance SDK singleton for the marketplace example.
 *
 * Returns a shared instance so all components use the same client.
 * The signer is optional — read-only operations (search, featured)
 * work without one, and the signer can be attached later via
 * `inv.wallet.connect()`.
 */
import { Invariance } from '@invariance/sdk';
import type { EIP1193Provider } from '@invariance/sdk';

let instance: Invariance | null = null;

/**
 * Get or create the Invariance SDK singleton.
 *
 * @param signer - Optional EIP-1193 provider (e.g. `window.ethereum`).
 *                 Pass it on first call when the user connects a wallet.
 * @returns The shared Invariance SDK instance.
 */
export function getInvariance(signer?: EIP1193Provider): Invariance {
  if (instance && !signer) {
    return instance;
  }

  instance = new Invariance({
    chain: 'base-sepolia',
    rpcUrl: process.env.NEXT_PUBLIC_RPC_URL ?? 'https://sepolia.base.org',
    signer: signer ?? undefined,
  });

  return instance;
}

/**
 * Reset the singleton — useful when the user disconnects their wallet.
 */
export function resetInvariance(): void {
  instance = null;
}
