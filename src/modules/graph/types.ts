import type { CrossChainAddress } from '@invariance/common';

/** Configuration for the GraphIntelligence module. */
export interface GraphIntelligenceConfig {
  /** API base URL for graph endpoints */
  apiUrl: string;
  /** API key for authentication */
  apiKey: string;
}

/** Options for querying a subgraph. */
export interface GraphQueryOptions {
  /** Center address */
  address: string;
  /** Depth of subgraph (number of hops) */
  depth?: number;
  /** Whether to include risk scores */
  includeRiskScores?: boolean;
}

/** Options for anomaly detection. */
export interface AnomalyDetectionOptions {
  /** Address to check */
  address: string;
  /** Specific anomaly types to check (default: all) */
  types?: string[];
}

/** Options for querying persisted anomaly history. */
export interface AnomalyHistoryOptions {
  /** Address to check */
  address: string;
  /** Optional anomaly type filter */
  type?: string;
  /** Max rows to return (default 50, max 200) */
  limit?: number;
}

/** Options for cross-chain linking. */
export interface CrossChainLinkOptions {
  /** Entity ID (or new if not provided) */
  entityId?: string;
  /** Addresses to link */
  addresses: CrossChainAddress[];
}
