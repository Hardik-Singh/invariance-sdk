/**
 * Type definitions for Invariance SDK convenience methods.
 *
 * These types support higher-level workflow methods on the {@link Invariance} class
 * that compose multiple module calls into single operations.
 */
import type {
  RegisterIdentityOptions,
  Identity,
  CreatePolicyOptions,
  SpecPolicy,
  PolicyRule,
  ActorType,
  ActorReference,
  LedgerEventInput,
  LedgerEntry,
  LedgerQueryFilters,
  IntentRequestOptions,
  IntentResult,
  ExportData,
  HireOptions,
  HireResult,
  CompletionResult,
  SubmitReviewOptions,
  ReputationScore,
} from '@invariance/common';

// ============================================================================
// 1. quickSetup
// ============================================================================

/** Options for {@link Invariance.quickSetup} */
export interface QuickSetupOptions {
  /** Identity registration options */
  identity: RegisterIdentityOptions;
  /** Policy to create and attach to the new identity */
  policy: CreatePolicyOptions;
}

/** Result of {@link Invariance.quickSetup} */
export interface QuickSetupResult {
  identity: Identity;
  policy: SpecPolicy;
}

// ============================================================================
// 2. hireAndFund
// ============================================================================

/** Options for {@link Invariance.hireAndFund} */
export interface HireAndFundOptions extends HireOptions {
  /** Amount to fund the escrow with (defaults to hire payment amount) */
  fundAmount?: string;
}

// ============================================================================
// 3. batchRegister
// ============================================================================

/** Options for a single agent in a batch registration */
export interface BatchAgentOptions {
  /** Identity registration options */
  identity: RegisterIdentityOptions;
  /** Optional per-agent policy override (otherwise shared policy is used) */
  policyOverride?: CreatePolicyOptions;
}

/** Result of a single agent in a batch registration */
export interface BatchRegisterEntry {
  identity: Identity;
  policy: SpecPolicy;
}

/** Options for {@link Invariance.batchRegister} */
export interface BatchRegisterOptions {
  /** Agents to register */
  agents: BatchAgentOptions[];
  /** Shared policy applied to all agents (unless overridden) */
  sharedPolicy: CreatePolicyOptions;
}

// ============================================================================
// 4. executeAndLog
// ============================================================================

/** Options for {@link Invariance.executeAndLog} */
export interface ExecuteAndLogOptions {
  /** Intent request options */
  intent: IntentRequestOptions;
  /** Additional ledger event to log alongside the intent */
  log: LedgerEventInput;
}

/** Result of {@link Invariance.executeAndLog} */
export interface ExecuteAndLogResult {
  intent: IntentResult;
  log: LedgerEntry;
}

// ============================================================================
// 5. recurringPayment
// ============================================================================

/** Options for {@link Invariance.recurringPayment} */
export interface RecurringPaymentOptions {
  /** Human-readable name for the payment policy */
  name: string;
  /** Payment amount per interval */
  amount: string;
  /** Payment recipient address */
  recipient: string;
  /** Interval between payments (ISO 8601 duration, e.g. "P1M" for monthly) */
  interval: string;
  /** Maximum number of payments (optional, unlimited if omitted) */
  maxPayments?: number;
  /** Actor types this policy applies to */
  actor?: ActorType | ActorType[];
  /** Allowed actions during the payment window */
  allowedActions?: string[];
  /** Policy expiry (ISO 8601 datetime) */
  expiry?: string;
}

// ============================================================================
// 6. createMultiSig
// ============================================================================

/** Options for {@link Invariance.createMultiSig} */
export interface CreateMultiSigOptions {
  /** Escrow amount in USDC */
  amount: string;
  /** Recipient identity or address */
  recipient: ActorReference;
  /** Signer addresses for multi-sig approval */
  signers: string[];
  /** Number of signatures required to release */
  threshold: number;
  /** Timeout per signer (ISO 8601 duration) */
  timeoutPerSigner?: string;
  /** Overall escrow timeout (ISO 8601 duration) */
  timeout?: string;
  /** Whether to auto-fund on creation */
  autoFund?: boolean;
}

// ============================================================================
// 7. setupRateLimitedAgent
// ============================================================================

/** Options for {@link Invariance.setupRateLimitedAgent} */
export interface SetupRateLimitedAgentOptions {
  /** Identity registration options */
  identity: RegisterIdentityOptions;
  /** Maximum actions per window */
  maxActions: number;
  /** Rate limit window (ISO 8601 duration, e.g. "PT1H" for 1 hour) */
  window: string;
  /** Cooldown between actions (ISO 8601 duration) */
  cooldown?: string;
  /** Allowed actions (whitelist) */
  allowedActions?: string[];
  /** Maximum spend per window */
  maxSpend?: string;
}

// ============================================================================
// 8. hireAndReview
// ============================================================================

/** Options for {@link Invariance.hireAndReview} */
export interface HireAndReviewOptions {
  /** Hire options */
  hire: HireOptions;
  /** Review to submit after completion */
  review: Omit<SubmitReviewOptions, 'target' | 'escrowId'>;
  /** Amount to fund escrow (defaults to hire payment amount) */
  fundAmount?: string;
}

/** Result of {@link Invariance.hireAndReview} */
export interface HireAndReviewResult {
  hire: HireResult;
  completion: CompletionResult;
  review: {
    reviewId: string;
    updatedReputation: ReputationScore;
  };
}

// ============================================================================
// 9. audit
// ============================================================================

/** Options for {@link Invariance.audit} */
export interface AuditOptions extends LedgerQueryFilters {
  /** Whether to verify each ledger entry */
  verify?: boolean;
  /** Export format */
  exportFormat?: 'json' | 'csv';
}

/** Result of {@link Invariance.audit} */
export interface AuditReport {
  entries: LedgerEntry[];
  totalEntries: number;
  verifiedCount: number;
  failedVerifications: Array<{
    entryId: string;
    error: string;
  }>;
  exported?: ExportData;
  generatedAt: number;
}

// ============================================================================
// 10. delegate
// ============================================================================

/** Options for {@link Invariance.delegate} */
export interface DelegateOptions {
  /** Identity ID of the delegating agent */
  from: string;
  /** Identity ID of the agent receiving delegation */
  to: string;
  /** Scope of allowed actions for the delegate */
  scope: {
    /** Allowed actions */
    actions: string[];
    /** Maximum spend limit */
    maxSpend?: string;
    /** Delegation expiry (ISO 8601 datetime) */
    expiry?: string;
    /** Additional policy rules */
    additionalRules?: PolicyRule[];
  };
}

/** Result of {@link Invariance.delegate} */
export interface DelegateResult {
  policy: SpecPolicy;
  intent: IntentResult;
}
