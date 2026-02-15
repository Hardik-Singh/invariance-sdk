/**
 * Re-exports and module-specific types for the Policy Engine module.
 */
export type {
  CreatePolicyOptions,
  PolicyRule,
  PolicyRuleType,
  SpecPolicy,
  PolicyStatus,
  EvaluationResult,
} from '@invariance/common';

export type { TxReceipt, Unsubscribe } from '@invariance/common';
export type { ActorReference } from '@invariance/common';

/** Options for evaluating an action against a policy */
export interface EvaluateOptions {
  policyId: string;
  actor: import('@invariance/common').ActorReference;
  action: string;
  amount?: string;
  params?: Record<string, unknown>;
  /** x402 payment receipt ID for require-payment rule verification */
  paymentReceiptId?: string;
}

/** Filters for listing policies */
export interface PolicyListFilters {
  identityId?: string;
  actor?: string;
  state?: 'active' | 'revoked' | 'expired';
  limit?: number;
  offset?: number;
}

/** Callback for policy violation events */
export type PolicyViolationCallback = (violation: {
  policyId: string;
  action: string;
  detail: string;
  timestamp: number;
}) => void;

/** On-chain representation of a policy (matches Solidity struct) */
export interface OnChainPolicy {
  policyId: `0x${string}`;
  name: string;
  creator: `0x${string}`;
  applicableActorTypes: readonly number[];
  state: number;
  createdAt: bigint;
  expiresAt: bigint;
}

/** On-chain representation of a policy rule (matches Solidity struct) */
export interface OnChainPolicyRule {
  ruleType: number;
  config: `0x${string}`;
}

// ============================================================================
// Policy Templates
// ============================================================================

/** Built-in template names */
export type BuiltInTemplate =
  | 'conservative-spending'
  | 'defi-trading'
  | 'content-agent'
  | 'research-agent'
  | 'full-autonomy'
  | 'mev-bot'
  | 'social-agent'
  | 'cross-chain-bridge'
  | 'payment-delegation'
  | 'iot-device'
  | 'government-benefits'
  | 'identity-verifier';

/** A policy template definition */
export interface PolicyTemplate {
  /** Template name */
  name: string;
  /** Human-readable description */
  description: string;
  /** Whether this is a built-in template */
  builtin: boolean;
  /** Policy rules included in the template */
  rules: import('@invariance/common').PolicyRule[];
}
