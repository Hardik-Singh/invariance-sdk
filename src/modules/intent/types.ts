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

// ============================================================================
// Retry Types
// ============================================================================

/** Configuration for intent retry behavior */
export interface RetryConfig {
  /** Maximum number of attempts (default: 3) */
  maxAttempts?: number;
  /** Initial delay in milliseconds (default: 1000) */
  initialDelayMs?: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier?: number;
  /** Error codes that trigger a retry (default: NETWORK_ERROR, RPC_ERROR, TIMEOUT) */
  retryableErrors?: string[];
}

/** Result of a retried intent request */
export interface RetryResult {
  /** The successful intent result (if any) */
  result: import('@invariance/common').IntentResult | null;
  /** Total number of attempts made */
  attempts: number;
  /** Errors from each failed attempt */
  errors: Array<{ attempt: number; error: string; code?: string }>;
  /** Whether the request ultimately succeeded */
  success: boolean;
}
