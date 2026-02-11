/**
 * ERC-8004 (Trustless Agents) types.
 *
 * Self-contained type definitions for the ERC-8004 module.
 * Standalone types have NO imports from Invariance common types.
 * Bridge types (at the bottom) import from Invariance where needed.
 */

// ============================================================================
// Standalone Types — no Invariance dependencies
// ============================================================================

/** Registry contract addresses for an ERC-8004 deployment */
export interface ERC8004RegistryAddresses {
  identity: `0x${string}`;
  reputation: `0x${string}`;
  validation: `0x${string}`;
}

/** Configuration for an ERC8004Manager instance */
export interface ERC8004Config {
  /** Chain ID of the target network */
  chainId: number;
  /** viem PublicClient for read operations */
  publicClient: unknown;
  /** Optional viem WalletClient for write operations */
  walletClient?: unknown;
  /** Override default registry addresses (for custom deployments) */
  registryAddresses?: ERC8004RegistryAddresses;
}

/** A single metadata key-value pair stored on an agent identity */
export interface ERC8004Metadata {
  key: string;
  value: string;
}

/** An agent identity registered in the ERC-8004 Identity Registry */
export interface ERC8004AgentIdentity {
  /** On-chain agent ID (token ID) */
  agentId: bigint;
  /** Agent URI (off-chain metadata pointer) */
  agentURI: string;
  /** Wallet address authorized to act on behalf of the agent */
  wallet: `0x${string}`;
  /** Cross-chain global identifier: eip155:{chainId}:{registryAddress} */
  globalId: string;
  /** Metadata entries associated with the agent */
  metadata: ERC8004Metadata[];
}

/** Options for the giveFeedback() call */
export interface GiveFeedbackOptions {
  /** Agent ID to give feedback on */
  agentId: bigint;
  /** Feedback value (contract-specific scale) */
  value: number;
  /** First feedback tag */
  tag1: string;
  /** Optional second feedback tag */
  tag2?: string;
  /** Optional feedback URI (off-chain details) */
  feedbackURI?: string;
}

/** A single feedback entry from the ERC-8004 Reputation Registry */
export interface ERC8004Feedback {
  /** Address of the client who gave the feedback */
  client: `0x${string}`;
  /** Feedback value */
  value: number;
  /** First feedback tag */
  tag1: string;
  /** Second feedback tag */
  tag2: string;
  /** Feedback URI */
  feedbackURI: string;
  /** Block timestamp */
  timestamp: number;
}

/** Aggregated reputation summary for an agent */
export interface ERC8004ReputationSummary {
  /** Total number of feedback entries */
  count: number;
  /** Summary value from the contract */
  summaryValue: number;
  /** Decimal precision of the summary value */
  decimals: number;
}

/** Filter options for reputation summary queries */
export interface ReputationSummaryFilterOptions {
  /** Filter by tag */
  tag?: string;
  /** Lookback period in milliseconds from now */
  lookbackMs?: number;
}

/** Options for requesting a validation */
export interface ValidationRequestOptions {
  /** Agent ID to validate */
  agentId: bigint;
  /** Validator address */
  validator: `0x${string}`;
  /** Validation request URI (details about what to validate) */
  requestURI: string;
}

/** Options for responding to a validation request */
export interface ValidationResponseOptions {
  /** Hash of the validation request */
  requestHash: `0x${string}`;
  /** Response value (0 = invalid, 1 = valid, etc.) */
  response: number;
  /** Optional response URI (off-chain proof) */
  responseURI?: string;
}

/** Full validation status for a request */
export interface ERC8004ValidationStatus {
  /** The request hash */
  requestHash: `0x${string}`;
  /** Agent ID being validated */
  agentId: bigint;
  /** Validator address */
  validator: `0x${string}`;
  /** Request URI */
  requestURI: string;
  /** Response value (0 if not yet responded) */
  response: number;
  /** Response URI */
  responseURI: string;
  /** Whether the validation is complete */
  completed: boolean;
}

/** Aggregated validation summary for an agent */
export interface ERC8004ValidationSummary {
  /** Total number of validation requests */
  count: number;
  /** Average response value */
  avgResponse: number;
}

/** Filter options for validation summary queries */
export interface ValidationSummaryFilterOptions {
  /** Filter by validator address */
  validator?: `0x${string}`;
  /** Lookback period in milliseconds from now */
  lookbackMs?: number;
}

// ============================================================================
// Bridge Types — import from Invariance common where needed
// ============================================================================

/** A linked identity pairing between Invariance and ERC-8004 */
export interface LinkedIdentity {
  /** Invariance identity ID */
  invarianceIdentityId: string;
  /** ERC-8004 agent ID */
  erc8004AgentId: string;
  /** ERC-8004 global ID */
  erc8004GlobalId: string;
  /** Timestamp when linked */
  linkedAt: number;
  /** Transaction hash of the linking operation */
  txHash: string;
}

/** External reputation signal pulled from ERC-8004 */
export interface ExternalReputationSignal {
  /** Source protocol */
  source: 'erc8004';
  /** Total feedback count */
  feedbackCount: number;
  /** Average feedback value */
  averageValue: number;
  /** Normalized score (0-100) */
  normalizedScore: number;
}

/** Options for pushing Invariance ledger data as ERC-8004 feedback */
export interface PushFeedbackOptions {
  /** First feedback tag */
  tag1: string;
  /** Optional second feedback tag */
  tag2?: string;
  /** Lookback period in milliseconds to query ledger entries */
  lookbackMs?: number;
  /** Optional feedback URI */
  feedbackURI?: string;
}
