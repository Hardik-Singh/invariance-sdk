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
// Convenience Types
// ============================================================================

export type {
  QuickSetupOptions,
  QuickSetupResult,
  HireAndFundOptions,
  BatchRegisterOptions,
  BatchRegisterEntry,
  BatchAgentOptions,
  ExecuteAndLogOptions,
  ExecuteAndLogResult,
  RecurringPaymentOptions,
  CreateMultiSigOptions,
  SetupRateLimitedAgentOptions,
  HireAndReviewOptions,
  HireAndReviewResult,
  AuditOptions,
  AuditReport,
  DelegateOptions,
  DelegateResult,
  DeferredOperation,
  BatchOptions,
  BatchResult,
  SessionOptions,
  PipelineStep,
  PipelineResult,
} from './core/convenience-types.js';

// ============================================================================
// Convenience Layer — New Classes
// ============================================================================

export { BatchExecutor } from './core/BatchExecutor.js';
export { SessionContext } from './core/SessionContext.js';
export { PipelineBuilder } from './core/PipelineBuilder.js';
export { LedgerAnalytics } from './modules/ledger/LedgerAnalytics.js';

// ============================================================================
// Core Infrastructure
// ============================================================================

/** @internal */
export { ContractFactory } from './core/ContractFactory.js';
/** @internal */
export { InvarianceEventEmitter } from './core/EventEmitter.js';
export type { InvarianceEvents } from './core/EventEmitter.js';
/** @internal */
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
export { EventLedgerCompact } from './modules/ledger/EventLedgerCompact.js';
export { AutoBatchedEventLedgerCompact } from './modules/ledger/AutoBatchedEventLedgerCompact.js';
export { Verifier } from './modules/verify/Verifier.js';
export { AtomicVerifier } from './modules/verify/AtomicVerifier.js';
export { ReputationEngine } from './modules/reputation/ReputationEngine.js';
export { GasManager } from './modules/gas/GasManager.js';
export { MarketplaceKit } from './modules/marketplace/MarketplaceKit.js';
export { AuditTrail } from './modules/audit/AuditTrail.js';
export { VotingManager } from './modules/voting/VotingManager.js';
export { OffchainLedger } from './modules/ledger/OffchainLedger.js';
export { SupabaseLedgerAdapter } from './modules/ledger/adapters/SupabaseLedgerAdapter.js';
export { InMemoryLedgerAdapter } from './modules/ledger/adapters/InMemoryLedgerAdapter.js';

// ============================================================================
// Module Managers — Compliance
// ============================================================================

export { ComplianceManager } from './modules/compliance/ComplianceManager.js';

// ============================================================================
// Module Managers — Graph Intelligence
// ============================================================================

export { GraphIntelligence } from './modules/graph/GraphIntelligence.js';

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
export type { IntentHistoryFilters, RetryConfig, RetryResult } from './modules/intent/types.js';

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
  PolicyTemplate,
  BuiltInTemplate,
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
export type { LedgerStreamCallback, AutoBatchConfig, OffchainLedgerEntry } from './modules/ledger/types.js';
export type {
  AnalyticsTimeframe,
  SuccessRateResult,
  ActionCountResult,
  CostSummaryResult,
  ViolationResult,
} from './modules/ledger/types.js';

// ============================================================================
// Module Types — Audit
// ============================================================================

export type {
  AuditConfig,
  AuditLogInput,
  AuditLogMode,
  AuditLogRecord,
  AuditQueryFilters,
  AuditVisibility,
  GateActionOptions,
  GateActionResult,
} from './modules/audit/types.js';

// ============================================================================
// Module Types — Compliance
// ============================================================================

export type {
  ComplianceManagerConfig,
  ComplianceCheckOptions,
  ComplianceCheckResult,
  ErasureRequestOptions,
} from './modules/compliance/types.js';

// ============================================================================
// Module Types — Graph Intelligence
// ============================================================================

export type {
  GraphIntelligenceConfig,
  GraphQueryOptions,
  AnomalyDetectionOptions,
  CrossChainLinkOptions,
} from './modules/graph/types.js';

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
// Module Types — X402
// ============================================================================

export { X402Manager } from './modules/x402/X402Manager.js';
export type {
  PayForActionOptions,
  PaymentReceipt,
  PaymentVerification,
  PaymentHistoryFilters,
  PaymentEstimate,
  X402Settings,
} from './modules/x402/types.js';

// ============================================================================
// Module — ERC-8004 (Trustless Agents)
// ============================================================================

export { ERC8004Manager, ERC8004Error } from './modules/erc8004/ERC8004Manager.js';
export { InvarianceBridge as ERC8004Bridge } from './modules/erc8004/InvarianceBridge.js';
export type {
  ERC8004Config,
  ERC8004RegistryAddresses,
  ERC8004AgentIdentity,
  ERC8004Metadata,
  GiveFeedbackOptions,
  ERC8004Feedback,
  ERC8004ReputationSummary,
  ReputationSummaryFilterOptions,
  ValidationRequestOptions,
  ValidationResponseOptions,
  ERC8004ValidationStatus,
  ERC8004ValidationSummary,
  ValidationSummaryFilterOptions,
  LinkedIdentity,
  ExternalReputationSignal,
  PushFeedbackOptions,
} from './modules/erc8004/types.js';
export { isERC8004Supported, getERC8004Addresses } from './modules/erc8004/addresses.js';

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
  LedgerAdapter,
} from '@invariance/common';
export type { EIP1193Provider, InvarianceSigner } from '@invariance/common';
export type { PaymentOptions, RequirePaymentConfig, PaymentGatedAuthorization } from '@invariance/common';

// ============================================================================
// Utility Functions
// ============================================================================

export { verifyWebhookSignature } from './utils/webhook.js';

// ============================================================================
// Platform Adapters
// ============================================================================

export { RuntimeHookAdapter } from './adapters/RuntimeHookAdapter.js';
export type {
  ActionContext,
  BeforeActionResult,
  AfterActionResult,
  RuntimeHooks,
} from './adapters/RuntimeHookAdapter.js';

export { MultiAgentComposer } from './adapters/MultiAgentComposer.js';
export type {
  CrewRole,
  CrewMember,
  SetupCrewOptions,
  CrewSetupResult,
} from './adapters/MultiAgentComposer.js';

export { MarketplacePlugin } from './adapters/MarketplacePlugin.js';
export type {
  PublishAgentOptions,
  PublishResult,
  HireWithEscrowOptions,
} from './adapters/MarketplacePlugin.js';

export { ReputationBridge } from './adapters/ReputationBridge.js';
export type {
  ExternalScore,
  AggregationWeights,
  AggregatedReputation,
} from './adapters/ReputationBridge.js';

export { CrossChainEscrow } from './adapters/CrossChainEscrow.js';
export type {
  ChainId,
  CrossChainEscrowOptions,
  CrossChainEscrowResult,
} from './adapters/CrossChainEscrow.js';

export { IdentityGatekeeper } from './adapters/IdentityGatekeeper.js';
export type {
  VerificationCredential,
  VerifyAndGateOptions,
  AccessLogEntry,
} from './adapters/IdentityGatekeeper.js';

export { BCIIntentVerifier } from './adapters/BCIIntentVerifier.js';
export type {
  BCISignal,
  ConfidenceThresholds,
  BCIVerificationResult,
} from './adapters/BCIIntentVerifier.js';

export { MEVComplianceKit } from './adapters/MEVComplianceKit.js';
export type {
  RegisterBotOptions,
  RegisteredBot,
  ExtractionLog,
} from './adapters/MEVComplianceKit.js';

export { GovernmentComplianceKit } from './adapters/GovernmentComplianceKit.js';
export type {
  AgencyRole,
  SetupAgencyOptions,
  AgencySetupResult,
  Milestone,
  MilestoneEscrowResult,
  DistributeBenefitsOptions,
  DistributionResult,
} from './adapters/GovernmentComplianceKit.js';

export { SocialGraphAdapter } from './adapters/SocialGraphAdapter.js';
export type {
  SocialLink,
  TrustNode,
  TrustGraph,
} from './adapters/SocialGraphAdapter.js';

// ============================================================================
// Wallet Utilities (re-exported from viem for convenience)
// ============================================================================

export { privateKeyToAccount, generatePrivateKey, mnemonicToAccount } from 'viem/accounts';
