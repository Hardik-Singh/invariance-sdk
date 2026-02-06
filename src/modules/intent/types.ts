/**
 * Re-exports and module-specific types for the Intent Protocol module.
 */
export type {
  IntentRequestOptions,
  IntentResult,
  PreparedIntent,
  IntentStatus,
  IntentLifecycle,
  ApprovalResult,
  ApprovalMethod,
  ProofBundle,
  GasEstimate,
  ActorReference,
} from '@invariance/common';

export type { TxReceipt } from '@invariance/common';

/** Filters for querying intent history */
export interface IntentHistoryFilters {
  actor?: string;
  action?: string | string[];
  status?: 'completed' | 'rejected' | 'expired';
  from?: string | number;
  to?: string | number;
  limit?: number;
  offset?: number;
}
