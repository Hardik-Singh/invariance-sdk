/**
 * Re-exports and module-specific types for the Event Ledger module.
 */
export type {
  LedgerEventInput,
  LedgerEntry,
  LedgerQueryFilters,
} from '@invariance/common';

export type { Unsubscribe, ExportData } from '@invariance/common';

/** Callback for streamed ledger entries */
export type LedgerStreamCallback = (entry: import('@invariance/common').LedgerEntry) => void;

// ============================================================================
// Auto-Batch Types
// ============================================================================

/** Configuration for auto-batching compact ledger entries */
export interface AutoBatchConfig {
  /** Maximum entries per batch (default: 10) */
  maxBatchSize?: number;
  /** Maximum wait time in ms before flushing (default: 5000) */
  maxWaitMs?: number;
  /** Whether batching is enabled (default: true) */
  enabled?: boolean;
}

// ============================================================================
// Analytics Types
// ============================================================================

/** Time range filter for analytics queries */
export interface AnalyticsTimeframe {
  from?: string | number;
  to?: string | number;
}

/** Result of a success rate query */
export interface SuccessRateResult {
  total: number;
  successful: number;
  failed: number;
  /** Success rate as a decimal (0-1) */
  rate: number;
  /** Success rate as a percentage (0-100) */
  percentage: number;
}

/** Result of an action count query */
export interface ActionCountResult {
  action: string;
  count: number;
  byCategory: Record<string, number>;
}

/** Result of a cost summary query */
export interface CostSummaryResult {
  totalCost: string;
  transactionCount: number;
  byAction: Record<string, number>;
}

/** Result of a violations query */
export interface ViolationResult {
  total: number;
  byAction: Record<string, number>;
  details: Array<{
    action: string;
    timestamp: number;
    detail: string;
    policyId: string;
  }>;
}
