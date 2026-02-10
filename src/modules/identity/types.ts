/**
 * Re-exports and module-specific types for the Identity module.
 */
export type {
  RegisterIdentityOptions,
  Identity,
  Attestation,
  PauseResult,
  ActorReference,
} from '@invariance/common';

export type { TxReceipt } from '@invariance/common';

/** Filters for listing identities */
export interface IdentityListFilters {
  type?: 'agent' | 'human' | 'device' | 'service';
  owner?: string;
  status?: 'active' | 'suspended' | 'deactivated';
  limit?: number;
  offset?: number;
}

/** Attestation input (without auto-generated fields) */
export interface AttestationInput {
  claim: string;
  attester: string;
  evidence?: string;
  expiresAt?: number;
}

/** Options for updating an identity */
export interface UpdateIdentityOptions {
  label?: string;
  metadata?: Record<string, string>;
  capabilities?: string[];
}

/**
 * Raw on-chain identity tuple returned by contract.read.get().
 * Matches IInvarianceIdentity.Identity struct layout.
 */
export interface OnChainIdentity {
  identityId: `0x${string}`;
  actorType: number;
  addr: `0x${string}`;
  owner: `0x${string}`;
  label: string;
  capabilities: readonly string[];
  status: number;
  createdAt: bigint;
  updatedAt: bigint;
}

/**
 * Raw on-chain attestation tuple returned by contract.read.getAttestations().
 * Matches InvarianceIdentity.Attestation struct layout.
 */
export interface OnChainAttestation {
  attestationId: `0x${string}`;
  identityId: `0x${string}`;
  attester: `0x${string}`;
  claim: string;
  evidenceHash: `0x${string}`;
  expiresAt: bigint;
  createdAt: bigint;
  revoked: boolean;
}
