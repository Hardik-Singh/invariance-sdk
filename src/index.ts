/**
 * @invariance/sdk
 *
 * TypeScript SDK for Invariance Protocol - universal verification framework
 * for agents, humans, and devices.
 *
 * @example
 * ```typescript
 * import { Invariance } from '@invariance/sdk';
 *
 * const inv = new Invariance({
 *   chain: 'base',
 *   rpcUrl: 'https://mainnet.base.org',
 *   signer: wallet,
 * });
 *
 * // Register an identity
 * const agent = await inv.identity.register({
 *   type: 'agent',
 *   owner: '0xDev',
 *   label: 'TraderBot',
 * });
 *
 * // Execute a verified intent
 * const result = await inv.intent.request({
 *   actor: { type: 'agent', address: agent.address },
 *   action: 'swap',
 *   params: { from: 'USDC', to: 'ETH', amount: '100' },
 *   approval: 'auto',
 * });
 *
 * // Verify any transaction
 * const verification = await inv.verify('0xtxhash...');
 * ```
 *
 * @packageDocumentation
 */

// ============================================================================
// Main Client
// ============================================================================

export { Invariance, SDK_VERSION } from './core/InvarianceClient.js';
export type { VerifyProxy } from './core/InvarianceClient.js';

// ============================================================================
// Core Infrastructure
// ============================================================================

export { ContractFactory } from './core/ContractFactory.js';
export { InvarianceEventEmitter } from './core/EventEmitter.js';
export type { InvarianceEvents } from './core/EventEmitter.js';
export { Telemetry } from './core/Telemetry.js';

// ============================================================================
// Errors
// ============================================================================

export { InvarianceError } from './errors/InvarianceError.js';
export { ErrorCode } from '@invariance/common';

// ============================================================================
// Module Managers
// ============================================================================

export { IdentityManager } from './modules/identity/IdentityManager.js';
export { WalletManager } from './modules/wallet/WalletManager.js';
export { IntentProtocol } from './modules/intent/IntentProtocol.js';
export { PolicyEngine } from './modules/policy/PolicyEngine.js';
export { EscrowManager } from './modules/escrow/EscrowManager.js';
export { EventLedger } from './modules/ledger/EventLedger.js';
export { Verifier } from './modules/verify/Verifier.js';
export { ReputationEngine } from './modules/reputation/ReputationEngine.js';
export { MarketplaceKit } from './modules/marketplace/MarketplaceKit.js';
export { GasManager } from './modules/gas/GasManager.js';
export { WebhookManager } from './modules/webhooks/WebhookManager.js';

// ============================================================================
// Module Types — Identity
// ============================================================================

export type {
  RegisterIdentityOptions,
  Identity,
  Attestation,
  PauseResult,
  ActorReference,
} from './modules/identity/types.js';
export type {
  IdentityListFilters,
  AttestationInput,
  UpdateIdentityOptions,
} from './modules/identity/types.js';

// ============================================================================
// Module Types — Wallet
// ============================================================================

export type {
  WalletInfo,
  BalanceInfo,
  FundOptions,
  CreateWalletOptions,
} from './modules/wallet/types.js';
export type { WalletProvider, ConnectOptions } from './modules/wallet/types.js';

// ============================================================================
// Module Types — Intent
// ============================================================================

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
} from './modules/intent/types.js';
export type { IntentHistoryFilters } from './modules/intent/types.js';

// ============================================================================
// Module Types — Policy
// ============================================================================

export type {
  CreatePolicyOptions,
  PolicyRule,
  PolicyRuleType,
  SpecPolicy,
  PolicyStatus,
  EvaluationResult,
} from './modules/policy/types.js';
export type {
  EvaluateOptions,
  PolicyListFilters,
  PolicyViolationCallback,
} from './modules/policy/types.js';

// ============================================================================
// Module Types — Escrow
// ============================================================================

export type {
  CreateEscrowOptions,
  EscrowContract,
  EscrowState,
  EscrowStatus,
  EscrowConditions,
  ApprovalStatus,
  ResolveOptions,
} from './modules/escrow/types.js';
export type {
  EscrowListFilters,
  EscrowStateChangeCallback,
  ReleaseOptions,
} from './modules/escrow/types.js';

// ============================================================================
// Module Types — Ledger
// ============================================================================

export type {
  LedgerEventInput,
  LedgerEntry,
  LedgerQueryFilters,
} from './modules/ledger/types.js';
export type { LedgerStreamCallback } from './modules/ledger/types.js';

// ============================================================================
// Module Types — Verify
// ============================================================================

export type {
  VerificationResult,
  IdentityVerification,
  EscrowVerification,
} from './modules/verify/types.js';
export type { ProofData, VerifyActionOptions } from './modules/verify/types.js';

// ============================================================================
// Module Types — Reputation
// ============================================================================

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
} from './modules/reputation/types.js';
export type {
  ReviewQueryOptions,
  ReviewList,
  ScoreHistoryOptions,
} from './modules/reputation/types.js';

// ============================================================================
// Module Types — Marketplace
// ============================================================================

export type {
  RegisterListingOptions,
  Listing,
  ListingCategory,
  PricingModel,
  SearchQuery,
  SearchResults,
  HireOptions,
  HireResult,
  CompletionResult,
} from './modules/marketplace/types.js';
export type {
  UpdateListingOptions,
  FeaturedOptions,
  CompleteHireOptions,
} from './modules/marketplace/types.js';

// ============================================================================
// Module Types — Gas
// ============================================================================

export type { GasBalance } from './modules/gas/types.js';
export type { EstimateGasOptions } from './modules/gas/types.js';

// ============================================================================
// Module Types — Webhooks
// ============================================================================

export type {
  RegisterWebhookOptions,
  Webhook,
  WebhookEvent,
  WebhookPayload,
  DeliveryLog,
} from './modules/webhooks/types.js';
export type {
  UpdateWebhookOptions,
  WebhookLogOptions,
} from './modules/webhooks/types.js';

// ============================================================================
// Common Types (re-exported for convenience)
// ============================================================================

export type {
  InvarianceConfig,
  TxReceipt,
  Unsubscribe,
  ExportData,
  ActorType,
  ChainConfig,
  ContractAddresses,
} from '@invariance/common';
export type { EIP1193Provider, InvarianceSigner } from '@invariance/common';

// ============================================================================
// Utility Functions
// ============================================================================

export { verifyWebhookSignature } from './utils/webhook.js';
