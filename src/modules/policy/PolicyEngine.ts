import type { ContractFactory } from '../../core/ContractFactory.js';
import type { InvarianceEventEmitter } from '../../core/EventEmitter.js';
import type { Telemetry } from '../../core/Telemetry.js';
import { ErrorCode } from '@invariance/common';
import type { Unsubscribe } from '@invariance/common';
import { InvarianceError } from '../../errors/InvarianceError.js';
import type {
  CreatePolicyOptions,
  SpecPolicy,
  PolicyStatus,
  EvaluationResult,
  TxReceipt,
  EvaluateOptions,
  PolicyListFilters,
  PolicyViolationCallback,
} from './types.js';

/**
 * Composable, verifiable condition sets for action control.
 *
 * The Policy Engine replaces simple permissions with composable, verifiable
 * condition sets. A policy is a set of rules: can I do this, under these
 * conditions, with these constraints, verified by these parties?
 *
 * @example
 * ```typescript
 * const policy = await inv.policy.create({
 *   name: 'Daily Trading Limits',
 *   actor: 'agent',
 *   rules: [
 *     { type: 'max-spend', config: { limit: '1000', period: '24h' } },
 *     { type: 'action-whitelist', config: { actions: ['swap'] } },
 *   ],
 * });
 * await inv.policy.attach(policy.policyId, agent.identityId);
 * ```
 */
export class PolicyEngine {
  private readonly contracts: ContractFactory;
  private readonly events: InvarianceEventEmitter;
  private readonly telemetry: Telemetry;

  constructor(
    contracts: ContractFactory,
    events: InvarianceEventEmitter,
    telemetry: Telemetry,
  ) {
    this.contracts = contracts;
    this.events = events;
    this.telemetry = telemetry;
  }

  /** Get the contract address for the policy module */
  getContractAddress(): string {
    return this.contracts.getAddress('policy');
  }

  /**
   * Create a new policy.
   *
   * Policies are registered on-chain and can be attached to one or more
   * identities. They support composable rules including spending limits,
   * time windows, action whitelists, and custom evaluators.
   *
   * @param opts - Policy creation options
   * @returns The created policy
   */
  async create(opts: CreatePolicyOptions): Promise<SpecPolicy> {
    this.telemetry.track('policy.create', { ruleCount: opts.rules.length });

    // TODO: Deploy policy to InvariancePolicy contract
    // 1. Serialize rules to on-chain format
    // 2. Call policy.createPolicy(name, rulesHash, actor, expiry)
    // 3. Wait for tx confirmation
    // 4. Parse PolicyCreated event
    this.events.emit('policy.created', {
      policyId: 'pending',
      name: opts.name,
    });

    throw new InvarianceError(
      ErrorCode.POLICY_VIOLATION,
      'Policy creation not yet implemented. Contract integration required.',
    );
  }

  /**
   * Attach a policy to an identity.
   *
   * Once attached, all actions by this identity will be evaluated
   * against the policy rules.
   *
   * @param policyId - The policy to attach
   * @param identityId - The identity to attach it to
   * @returns Transaction receipt
   */
  async attach(policyId: string, identityId: string): Promise<TxReceipt> {
    this.telemetry.track('policy.attach');

    // TODO: Call policy.attachPolicy(policyId, identityId) on-chain
    throw new InvarianceError(
      ErrorCode.POLICY_VIOLATION,
      `Cannot attach policy ${policyId} to identity ${identityId}. Contract integration required.`,
    );
  }

  /**
   * Remove a policy from an identity.
   *
   * @param policyId - The policy to detach
   * @param identityId - The identity to detach it from
   * @returns Transaction receipt
   */
  async detach(policyId: string, identityId: string): Promise<TxReceipt> {
    this.telemetry.track('policy.detach');

    // TODO: Call policy.detachPolicy(policyId, identityId) on-chain
    throw new InvarianceError(
      ErrorCode.POLICY_VIOLATION,
      `Cannot detach policy ${policyId} from identity ${identityId}. Contract integration required.`,
    );
  }

  /**
   * Evaluate an action against a policy without executing.
   *
   * Returns detailed rule-by-rule evaluation results, remaining
   * budgets, and compliance proof if all rules pass.
   *
   * @param opts - Evaluation options (policy, actor, action)
   * @returns Detailed evaluation result per rule
   */
  async evaluate(opts: EvaluateOptions): Promise<EvaluationResult> {
    this.telemetry.track('policy.evaluate');

    // TODO: Evaluate action against policy rules
    // 1. Fetch policy from chain or cache
    // 2. Run each rule evaluator
    // 3. Generate compliance proof if all pass
    return {
      allowed: false,
      policyId: opts.policyId,
      ruleResults: [],
    };
  }

  /**
   * Revoke a policy entirely.
   *
   * Once revoked, the policy cannot be re-activated. All identities
   * with this policy attached will have it automatically detached.
   *
   * @param policyId - The policy to revoke
   * @returns Transaction receipt
   */
  async revoke(policyId: string): Promise<TxReceipt> {
    this.telemetry.track('policy.revoke');

    // TODO: Call policy.revokePolicy(policyId) on-chain
    throw new InvarianceError(
      ErrorCode.POLICY_VIOLATION,
      `Cannot revoke policy ${policyId}. Contract integration required.`,
    );
  }

  /**
   * Check policy state and usage statistics.
   *
   * @param policyId - The policy to check
   * @returns Extended policy status with usage metrics
   */
  async status(policyId: string): Promise<PolicyStatus> {
    this.telemetry.track('policy.status');

    // TODO: Fetch policy + usage stats from chain/indexer
    throw new InvarianceError(
      ErrorCode.POLICY_VIOLATION,
      `Policy not found: ${policyId}`,
    );
  }

  /**
   * List policies by identity, type, or status.
   *
   * @param filters - Optional filters
   * @returns Array of matching policies
   */
  async list(filters?: PolicyListFilters): Promise<SpecPolicy[]> {
    this.telemetry.track('policy.list', { hasFilters: filters !== undefined });

    // TODO: Query indexer with filters
    return [];
  }

  /**
   * Combine multiple policies into one composite policy.
   *
   * The composed policy evaluates all constituent rules. An action
   * must pass ALL rules from ALL composed policies to be allowed.
   *
   * @param policyIds - Array of policy IDs to compose
   * @returns The new composite policy
   */
  async compose(policyIds: string[]): Promise<SpecPolicy> {
    this.telemetry.track('policy.compose', { count: policyIds.length });

    // TODO: Create composite policy on-chain
    // 1. Fetch all policies
    // 2. Merge rules
    // 3. Register new composite policy
    throw new InvarianceError(
      ErrorCode.POLICY_VIOLATION,
      'Policy composition not yet implemented. Contract integration required.',
    );
  }

  /**
   * Subscribe to policy violations in real-time.
   *
   * @param policyId - The policy to monitor
   * @param callback - Called when a violation occurs
   * @returns Unsubscribe function
   */
  onViolation(policyId: string, callback: PolicyViolationCallback): Unsubscribe {
    this.telemetry.track('policy.onViolation');

    // Subscribe to SDK-level violation events filtered by policyId
    const unsubscribe = this.events.on('policy.violation', (data) => {
      if (data.policyId === policyId) {
        callback({
          policyId: data.policyId,
          action: data.action,
          detail: data.detail,
          timestamp: Date.now(),
        });
      }
    });

    return unsubscribe;
  }
}
