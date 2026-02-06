/**
 * Re-exports and module-specific types for the Verify module.
 */
export type {
  VerificationResult,
  IdentityVerification,
  EscrowVerification,
} from '@invariance/common';

export type { ProofBundle, ActorReference } from '@invariance/common';

/** Decoded proof data */
export interface ProofData {
  proofHash: string;
  actor: import('@invariance/common').ActorReference;
  action: string;
  timestamp: number;
  blockNumber: number;
  signatures: {
    actor: string;
    platform?: string;
    valid: boolean;
  };
  metadataHash: string;
  raw: string;
  verified: boolean;
}

/** Options for verifying by actor and action */
export interface VerifyActionOptions {
  actor: string;
  action?: string;
  from?: string | number;
  to?: string | number;
}
