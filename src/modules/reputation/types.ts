/**
 * Re-exports and module-specific types for the Reputation Engine module.
 */
export type {
  ReputationScore,
  ReputationProfile,
  OnChainMetrics,
  SubmitReviewOptions,
  Review,
  ReviewSummary,
  Badge,
  ComparisonResult,
  ScoreHistory,
  ScoreHistoryEntry,
} from '@invariance/common';

/** Options for querying reviews */
export interface ReviewQueryOptions {
  limit?: number;
  offset?: number;
  sortBy?: 'newest' | 'highest' | 'lowest';
}

/** Paginated review list */
export interface ReviewList {
  reviews: import('@invariance/common').Review[];
  total: number;
  page: number;
}

/** Options for querying score history */
export interface ScoreHistoryOptions {
  from?: string | number;
  to?: string | number;
  limit?: number;
}
