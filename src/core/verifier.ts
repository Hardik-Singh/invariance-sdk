import type {
  ActionInput,
  PolicyConfig,
  PolicyCheckResult,
  AnyPolicy,
  SpendingCapPolicy,
  VotingPolicy,
  HumanApprovalPolicy,
  InvarianceTemplate,
  TemplateId,
  TemplateCheckResult,
  VerificationContext,
} from '@invariance/common';

import { TemplateVerifier, type TemplateProofs } from './template-verifier.js';

/**
 * External state provider interface for spending tracking.
 * This allows the verifier to remain stateless while still
 * supporting stateful checks like daily spending limits.
 */
export interface SpendingStateProvider {
  /** Get the current daily spending for a token */
  getDailySpending(token: string): bigint;
}

/**
 * Tracks daily spending for a specific token.
 * @deprecated Use SpendingStateProvider instead for stateless operation
 */
interface DailySpendingEntry {
  /** Total amount spent today */
  amount: bigint;
  /** Date string (YYYY-MM-DD) for this entry */
  date: string;
}

/**
 * Verifies actions against policy rules and templates.
 *
 * The verifier supports two modes:
 * 1. Stateless mode: Use setSpendingProvider() to externalize state
 * 2. Stateful mode (deprecated): Uses internal dailySpending tracking
 */
export class Verifier {
  private readonly config: PolicyConfig | undefined;
  /** @deprecated Use SpendingStateProvider instead */
  private dailySpending: Map<string, DailySpendingEntry> = new Map();
  /** External spending state provider (stateless mode) */
  private spendingProvider: SpendingStateProvider | null = null;
  /** Template verifier for advanced verification */
  private readonly templateVerifier: TemplateVerifier;

  constructor(config?: PolicyConfig, templates?: InvarianceTemplate[]) {
    this.config = config;
    this.templateVerifier = new TemplateVerifier();

    // Register any provided templates
    templates?.forEach((t) => this.templateVerifier.registerTemplate(t));
  }

  /**
   * Set an external spending state provider.
   * This enables stateless operation where spending tracking
   * is handled externally.
   *
   * @param provider - The spending state provider
   */
  setSpendingProvider(provider: SpendingStateProvider): void {
    this.spendingProvider = provider;
  }

  // ============================================================================
  // Template Methods
  // ============================================================================

  /**
   * Register a template for verification.
   *
   * @param template - The template to register
   */
  registerTemplate(template: InvarianceTemplate): void {
    this.templateVerifier.registerTemplate(template);
  }

  /**
   * Unregister a template.
   *
   * @param templateId - The template ID to unregister
   * @returns True if the template was found and removed
   */
  unregisterTemplate(templateId: TemplateId | string): boolean {
    return this.templateVerifier.unregisterTemplate(templateId);
  }

  /**
   * Check if a template exists.
   *
   * @param templateId - The template ID to check
   */
  hasTemplate(templateId: TemplateId | string): boolean {
    return this.templateVerifier.hasTemplate(templateId);
  }

  /**
   * Get a registered template.
   *
   * @param templateId - The template ID to get
   */
  getTemplate(templateId: TemplateId | string): InvarianceTemplate | undefined {
    return this.templateVerifier.getTemplate(templateId);
  }

  /**
   * Check an action against a template.
   * This is the main entry point for template-based verification.
   *
   * @param templateId - The template to check against
   * @param action - The action to verify
   * @param context - The verification context
   * @param proofs - Optional proof data for each rule category
   * @returns Promise resolving to the template check result
   */
  async checkTemplatePolicy(
    templateId: TemplateId | string,
    action: ActionInput,
    context: VerificationContext,
    proofs?: TemplateProofs,
  ): Promise<TemplateCheckResult> {
    return this.templateVerifier.checkTemplate(templateId, action, context, proofs);
  }

  /**
   * @deprecated Use checkTemplatePolicy instead
   */
  async checkTemplatePermission(
    templateId: TemplateId | string,
    action: ActionInput,
    context: VerificationContext,
    proofs?: TemplateProofs,
  ): Promise<TemplateCheckResult> {
    return this.checkTemplatePolicy(templateId, action, context, proofs);
  }

  // ============================================================================
  // Policy Check Methods
  // ============================================================================

  /**
   * Check if an action is permitted based on the configured policies.
   *
   * @param action - The action to check
   * @returns The result of the policy check
   */
  checkPolicy(action: ActionInput): PolicyCheckResult {
    // No policies configured = allow by default
    if (!this.config) {
      return { allowed: true };
    }

    // Check each policy
    for (const policy of this.config.policies) {
      if (!policy.active) continue;

      const result = this.checkSinglePolicy(policy, action);
      if (!result.allowed) {
        return result;
      }
    }

    // All policies passed
    return { allowed: true };
  }

  /**
   * @deprecated Use checkPolicy instead
   */
  checkPermission(action: ActionInput): PolicyCheckResult {
    return this.checkPolicy(action);
  }

  /**
   * Check a single policy rule.
   */
  private checkSinglePolicy(
    policy: AnyPolicy,
    action: ActionInput,
  ): PolicyCheckResult {
    switch (policy.type) {
      case 'spending-cap':
        return this.checkSpendingCap(policy, action);
      case 'time-window':
        return this.checkTimeWindow(policy);
      case 'action-whitelist':
        return this.checkActionWhitelist(policy, action);
      case 'voting':
        return this.checkVoting(policy, action);
      case 'human-approval':
        return this.checkHumanApproval(policy, action);
      default: {
        // TypeScript exhaustiveness check - ensures all policy types are handled
        policy satisfies never;
        return { allowed: true };
      }
    }
  }

  /**
   * Check spending cap policy.
   *
   * @param policy - The spending cap policy to check against
   * @param action - The action being verified
   * @returns Policy check result
   */
  private checkSpendingCap(
    policy: SpendingCapPolicy,
    action: ActionInput,
  ): PolicyCheckResult {
    const amount = this.extractAmount(action);

    // No amount in action params, allow by default
    if (amount === null) {
      return { allowed: true };
    }

    // Check per-transaction limit
    if (amount > policy.maxPerTx) {
      return {
        allowed: false,
        deniedBy: policy,
        reason: `Amount ${amount} exceeds per-transaction limit of ${policy.maxPerTx}`,
      };
    }

    // Check daily limit using external provider (stateless) or internal state (deprecated)
    const currentAmount = this.getCurrentDailySpending(policy.token);

    if (currentAmount + amount > policy.maxPerDay) {
      return {
        allowed: false,
        deniedBy: policy,
        reason: `Daily spending would exceed limit: current ${currentAmount} + ${amount} > ${policy.maxPerDay}`,
      };
    }

    return { allowed: true };
  }

  /**
   * Get current daily spending for a token.
   * Uses external provider if available, otherwise falls back to internal state.
   */
  private getCurrentDailySpending(token: string): bigint {
    if (this.spendingProvider) {
      return this.spendingProvider.getDailySpending(token);
    }

    // Fallback to internal state (deprecated)
    const today = new Date().toISOString().split('T')[0] ?? '';
    const dailyKey = `${token}-${today}`;
    const currentEntry = this.dailySpending.get(dailyKey);
    return currentEntry?.date === today ? currentEntry.amount : 0n;
  }

  /**
   * Record spending after a successful action execution.
   * Call this after the action has been executed to track daily totals.
   *
   * @deprecated Use external SpendingStateProvider instead
   * @param token - The token address (or '0x0...' for native ETH)
   * @param amount - The amount spent
   */
  recordSpending(token: string, amount: bigint): void {
    const today = new Date().toISOString().split('T')[0] ?? '';
    const dailyKey = `${token}-${today}`;
    const currentEntry = this.dailySpending.get(dailyKey);

    const currentAmount = currentEntry?.date === today ? currentEntry.amount : 0n;
    this.dailySpending.set(dailyKey, {
      amount: currentAmount + amount,
      date: today,
    });
  }

  /**
   * Get the current daily spending for a token.
   *
   * @deprecated Use external SpendingStateProvider instead
   * @param token - The token address
   * @returns The amount spent today for this token
   */
  getDailySpending(token: string): bigint {
    return this.getCurrentDailySpending(token);
  }

  /**
   * Extract amount from action params.
   * Looks for common amount field names: amount, value, wei, quantity.
   *
   * @param action - The action to extract amount from
   * @returns The amount as bigint, or null if not found
   */
  private extractAmount(action: ActionInput): bigint | null {
    const params = action.params;
    const amountFields = ['amount', 'value', 'wei', 'quantity'];

    for (const field of amountFields) {
      const value = params[field];

      if (typeof value === 'bigint') {
        return value;
      }

      if (typeof value === 'string' || typeof value === 'number') {
        try {
          return BigInt(value);
        } catch {
          // Not a valid bigint, continue to next field
        }
      }
    }

    return null;
  }

  /**
   * Check time window policy.
   */
  private checkTimeWindow(policy: {
    startHour: number;
    endHour: number;
    allowedDays: number[];
  }): PolicyCheckResult {
    const now = new Date();
    const hour = now.getUTCHours();
    const day = now.getUTCDay();

    // Check day of week
    if (!policy.allowedDays.includes(day)) {
      return {
        allowed: false,
        reason: `Action not allowed on this day of week (${day})`,
      };
    }

    // Check hour
    if (hour < policy.startHour || hour >= policy.endHour) {
      return {
        allowed: false,
        reason: `Action not allowed at this hour (${hour} UTC)`,
      };
    }

    return { allowed: true };
  }

  /**
   * Check action whitelist policy.
   */
  private checkActionWhitelist(
    policy: { allowedActions: string[] },
    action: ActionInput,
  ): PolicyCheckResult {
    const isAllowed = policy.allowedActions.some((pattern) => {
      // Support wildcard matching
      if (pattern.endsWith('*')) {
        return action.type.startsWith(pattern.slice(0, -1));
      }
      return action.type === pattern;
    });

    if (!isAllowed) {
      return {
        allowed: false,
        reason: `Action type "${action.type}" is not in whitelist`,
      };
    }

    return { allowed: true };
  }

  /**
   * Check voting policy.
   * Sync check always returns false for voting policies - use async policies.
   *
   * @param policy - The voting policy configuration
   * @param action - The action to check
   * @returns Policy check result (always denied for sync check)
   */
  private checkVoting(
    policy: VotingPolicy,
    action: ActionInput,
  ): PolicyCheckResult {
    // Check if this action type requires voting
    const requiredFor = policy.requiredForActions;

    // Empty array = all actions require voting
    if (requiredFor.length === 0) {
      return {
        allowed: false,
        deniedBy: policy,
        reason: 'Action requires voting approval. Use Voting policy for async flow.',
      };
    }

    const requiresVoting = requiredFor.some((pattern) => {
      if (pattern.endsWith('*')) {
        return action.type.startsWith(pattern.slice(0, -1));
      }
      return action.type === pattern;
    });

    if (requiresVoting) {
      return {
        allowed: false,
        deniedBy: policy,
        reason: 'Action requires voting approval. Use Voting policy for async flow.',
      };
    }

    return { allowed: true };
  }

  /**
   * Check human approval policy.
   * Sync check always returns false for approval policies - use async policies.
   *
   * @param policy - The human approval policy configuration
   * @param action - The action to check
   * @returns Policy check result (always denied for sync check if triggers match)
   */
  private checkHumanApproval(
    policy: HumanApprovalPolicy,
    action: ActionInput,
  ): PolicyCheckResult {
    // Check if any trigger matches
    for (const trigger of policy.triggers) {
      if (this.triggerMatches(trigger, action)) {
        return {
          allowed: false,
          deniedBy: policy,
          reason: 'Action requires human approval. Use HumanApproval policy for async flow.',
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Check if a trigger matches an action.
   */
  private triggerMatches(
    trigger: HumanApprovalPolicy['triggers'][number],
    action: ActionInput,
  ): boolean {
    switch (trigger.type) {
      case 'always':
        return true;

      case 'action-type':
        return trigger.patterns.some((pattern) => {
          if (pattern.endsWith('*')) {
            return action.type.startsWith(pattern.slice(0, -1));
          }
          return action.type === pattern;
        });

      case 'amount-threshold': {
        const amount = this.extractAmount(action);
        if (amount === null) return false;

        // If token is specified, check that it matches
        if (trigger.token) {
          const actionToken = action.params['token'] as string | undefined;
          if (actionToken && actionToken !== trigger.token) {
            return false;
          }
        }

        return amount >= trigger.threshold;
      }

      case 'custom':
        // Custom predicates require the async template
        return true;
    }
  }
}
