/**
 * SDK singleton with lazy initialization.
 *
 * Provides `getInvariance(signer?)` which creates or returns the shared
 * Invariance instance.  Also re-exports the most commonly used SDK types
 * so page / component code can import from one place.
 */

import { Invariance, InvarianceError, ErrorCode } from '@invariance/sdk';
import type {
  Identity,
  ActorReference,
  RegisterIdentityOptions,
  CreatePolicyOptions,
  PolicyRule,
  PolicyRuleType,
  SpecPolicy,
  EvaluationResult,
  IntentRequestOptions,
  IntentResult,
  IntentStatus,
  IntentLifecycle,
  PreparedIntent,
  ApprovalMethod,
  ApprovalResult,
  CreateEscrowOptions,
  EscrowContract,
  EscrowStatus,
  EscrowState,
  LedgerEventInput,
  LedgerEntry,
  LedgerQueryFilters,
  VerificationResult,
  InvarianceConfig,
} from '@invariance/sdk';

// ---- re-exports for convenience ----
export { Invariance, InvarianceError, ErrorCode };
export type {
  Identity,
  ActorReference,
  RegisterIdentityOptions,
  CreatePolicyOptions,
  PolicyRule,
  PolicyRuleType,
  SpecPolicy,
  EvaluationResult,
  IntentRequestOptions,
  IntentResult,
  IntentStatus,
  IntentLifecycle,
  PreparedIntent,
  ApprovalMethod,
  ApprovalResult,
  CreateEscrowOptions,
  EscrowContract,
  EscrowStatus,
  EscrowState,
  LedgerEventInput,
  LedgerEntry,
  LedgerQueryFilters,
  VerificationResult,
  InvarianceConfig,
};

// ---- singleton ----

let instance: Invariance | null = null;

/**
 * Get (or create) the shared Invariance SDK instance.
 *
 * @param signer - Optional wallet / EIP-1193 provider.  When omitted the
 *                 existing instance is returned (or a signer-less one created).
 */
export async function getInvariance(signer?: InvarianceConfig['signer']): Promise<Invariance> {
  if (instance && !signer) {
    return instance;
  }

  const config: InvarianceConfig = {
    chain: 'base-sepolia',
    rpcUrl: process.env.NEXT_PUBLIC_RPC_URL ?? 'https://sepolia.base.org',
    signer,
  };

  instance = new Invariance(config);
  await instance.ensureWalletInit();
  return instance;
}

/**
 * Return the current instance without creating one.  Returns `null` when the
 * SDK has not been initialised yet.
 */
export function getInvarianceInstance(): Invariance | null {
  return instance;
}
