/**
 * @invariance/sdk
 *
 * TypeScript SDK for Invariance Protocol - secure execution layer for autonomous agents.
 *
 * @example
 * ```typescript
 * import { Invariance, SpendingCap } from '@invariance/sdk';
 *
 * const spendingCap = new SpendingCap({
 *   maxPerTx: 1_000_000_000_000_000_000n, // 1 ETH
 *   maxPerDay: 5_000_000_000_000_000_000n, // 5 ETH
 * });
 *
 * const inv = new Invariance({
 *   chainId: 8453, // Base mainnet
 *   rpcUrl: process.env.RPC_URL,
 *   policies: {
 *     policies: [spendingCap.toPolicy()],
 *     defaultAllow: true,
 *   },
 * });
 *
 * // Simulate before executing
 * const sim = await inv.simulateExecute(action);
 * if (sim.allowed) {
 *   const result = await inv.execute(action);
 * }
 * ```
 *
 * @packageDocumentation
 */

// ============================================================================
// Re-export common types (new policy terminology)
// ============================================================================

export type {
  AgentId,
  ActionId,
  TaskId,
  IntentHash,
  Action,
  ActionInput,
  ActionResult,
  ActionResultWithProvenance,
  // Policy types (new terminology)
  Policy,
  PolicyType,
  SpendingCapPolicy,
  TimeWindowPolicy,
  ActionWhitelistPolicy,
  VotingPolicy,
  HumanApprovalPolicy,
  VotingMode,
  VotingConfig,
  MultiSigConfig,
  DAOVotingConfig,
  ThresholdConfig,
  ApprovalTrigger,
  ApprovalChannel,
  AnyPolicy,
  PolicyConfig,
  PolicyCheckResult,
  ActorType,
  ActionCategory,
  // Deprecated aliases (backward compat)
  Permission,
  PermissionType,
  SpendingCapPermission,
  TimeWindowPermission,
  ActionWhitelistPermission,
  VotingPermission,
  HumanApprovalPermission,
  AnyPermission,
  PermissionConfig,
  PermissionCheckResult,
} from '@invariance/common';

// Re-export utility functions
export {
  createAgentId,
  createActionId,
  createTaskId,
  createIntentHash,
} from '@invariance/common';

// Re-export defaults
export {
  DEFAULT_POLICY_VALUES,
  MAX_UINT256,
  applyPolicyDefaults,
} from '@invariance/common';

// ============================================================================
// Main client
// ============================================================================

export { Invariance, SDK_VERSION } from './client.js';
export type {
  InvarianceConfig,
  BeforeExecutionCallback,
  SimulationResult,
  AnomalyResult,
  AnomalyDetector,
  ExecutionContext,
  ActionSummary,
  DailyStats,
  RuntimeFingerprint,
  RiskSignal,
} from './client.js';

// ============================================================================
// Core modules
// ============================================================================

export { Verifier } from './core/verifier.js';
export type { SpendingStateProvider } from './core/verifier.js';

export { Serializer } from './core/serializer.js';

export { CooldownTracker } from './core/cooldown-tracker.js';

export {
  generateIntentHash,
  generatePolicyHash,
  generateRuntimeFingerprint,
} from './core/intent.js';

// ============================================================================
// Execution policies (new terminology)
// ============================================================================

export { SpendingCap } from './policies/spending-cap.js';
export type { SpendingCapOptions } from './policies/spending-cap.js';

export { TimeWindow } from './policies/time-window.js';
export type { TimeWindowOptions } from './policies/time-window.js';

export { ActionWhitelist } from './policies/action-whitelist.js';
export type { ActionWhitelistOptions } from './policies/action-whitelist.js';

export { Voting } from './policies/voting.js';
export type { VotingOptions, Vote, Proposal, VoteRequestCallback } from './policies/voting.js';

export { HumanApproval } from './policies/human-approval.js';
export type {
  HumanApprovalOptions,
  ApprovalRequest,
  ApprovalRequestCallback,
  CustomPredicate,
} from './policies/human-approval.js';

// Base policy types
export type {
  ExecutionPolicy,
  AsyncExecutionPolicy,
  // Deprecated aliases
  PermissionTemplate,
  AsyncPermissionTemplate,
} from './policies/types.js';
export { isAsyncPolicy, isAsyncPermission } from './policies/types.js';

// ============================================================================
// Wallet adapters
// ============================================================================

export type { WalletAdapter } from './wallet/types.js';
export { PrivyWallet } from './wallet/privy.js';
export { LocalWallet } from './wallet/local.js';

// ============================================================================
// Contract wrappers
// ============================================================================

export { InvarianceCore } from './contracts/core.js';
export type { InvarianceCoreContract } from './contracts/core.js';

export { PolicyGate, PermissionGate } from './contracts/policy-gate.js';
export type {
  PolicyGateContract,
  PermissionGateContract,
  PolicyCheckResult as ContractPolicyCheckResult,
} from './contracts/policy-gate.js';

// ============================================================================
// Errors
// ============================================================================

export { InvarianceError } from './errors/base.js';
export { PolicyDeniedError, PermissionDeniedError } from './errors/policy-denied.js';
export { StateFailedError } from './errors/state-failed.js';

// ============================================================================
// Template System Exports
// ============================================================================

// Re-export template types from common
export type {
  // Core template types
  InvarianceTemplate,
  TemplateId,
  TemplateOptions,
  TemplateCheckResult,
  VerificationRules,
  ExecutionConfig,
  MonitoringConfig,
  VerificationContext,
  FunctionDefinition,
  RuleCheckResults,
  RuleResult,
  RuleDetail,
  // Authorization types
  AuthorizationRule,
  AuthorizationType,
  SignatureAuthorization,
  MultiSigAuthorization,
  WhitelistAuthorization,
  TokenGatedAuthorization,
  NFTGatedAuthorization,
  // Condition types
  StateCondition,
  ConditionType,
  BalanceCheckCondition,
  AllowanceCheckCondition,
  // Timing types
  TimingRule,
  TimingType,
  TimeWindowRule,
  CooldownRule,
  // Rate limit types
  RateLimitRule,
  RateLimitType,
  PerAddressRateLimit,
  ValueRateLimit,
  // Execution types
  ExecutionMode,
  RollbackRule,
  // Staking types
  StakingRule,
  StakingType,
} from '@invariance/common';

// Export template verifier
export { TemplateVerifier } from './core/template-verifier.js';
export type { TemplateProofs } from './core/template-verifier.js';

// Export template infrastructure
export { BaseTemplate } from './templates/base.js';
export type { TemplateConstructor } from './templates/base.js';

export { TemplateRegistry, globalRegistry } from './templates/registry.js';

export { TemplateBuilder } from './templates/builder.js';

export { TemplateValidator, templateValidator } from './templates/validator.js';
export type { ValidationError, ValidationResult } from './templates/validator.js';

// Export prebuilt templates
export {
  createSimpleTransferTemplate,
  createMultisigTransferTemplate,
  createTradingAgentTemplate,
  createDAOGovernedTemplate,
  createNFTGatedTemplate,
} from './templates/prebuilt/index.js';

export type {
  SimpleTransferOptions,
  MultisigTransferOptions,
  TradingAgentOptions,
  DAOGovernedOptions,
  NFTGatedOptions,
} from './templates/prebuilt/index.js';

// ============================================================================
// Permission Marketplace
// ============================================================================

export * from './marketplace/index.js';
