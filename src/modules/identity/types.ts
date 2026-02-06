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
