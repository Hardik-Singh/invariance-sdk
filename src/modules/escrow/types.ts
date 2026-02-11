/**
 * Re-exports and module-specific types for the Escrow module.
 */
export type {
  CreateEscrowOptions,
  EscrowContract,
  EscrowState,
  EscrowStatus,
  EscrowConditions,
  MultiSigConfig,
  ApprovalStatus,
  ResolveOptions,
} from '@invariance/common';

export type { ApprovalResult, TxReceipt, Unsubscribe } from '@invariance/common';

/** Filters for listing escrows */
export interface EscrowListFilters {
  depositor?: string;
  recipient?: string;
  state?: import('@invariance/common').EscrowState;
  limit?: number;
  offset?: number;
}

/** Callback for escrow state change events */
export type EscrowStateChangeCallback = (change: {
  escrowId: string;
  previousState: import('@invariance/common').EscrowState;
  newState: import('@invariance/common').EscrowState;
  txHash: string;
  timestamp: number;
}) => void;

/** Options for releasing escrow funds */
export interface ReleaseOptions {
  /** Optional linked intent ID for automatic release verification */
  intentId?: string;
}

/** On-chain escrow tuple from InvarianceEscrow.sol */
export interface OnChainEscrow {
  escrowId: `0x${string}`;
  depositorIdentityId: `0x${string}`;
  beneficiaryIdentityId: `0x${string}`;
  depositor: `0x${string}`;
  beneficiary: `0x${string}`;
  amount: bigint;
  fundedAmount: bigint;
  conditionType: number;
  conditionData: `0x${string}`;
  state: number;
  createdAt: bigint;
  expiresAt: bigint;
  releasedAt: bigint;
}
