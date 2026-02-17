import type { ContractFactory } from '../../core/ContractFactory.js';
import type { InvarianceEventEmitter } from '../../core/EventEmitter.js';
import type { Telemetry } from '../../core/Telemetry.js';
import type { ActorType } from '@invariance/common';
import { ErrorCode } from '@invariance/common';
import type { Unsubscribe } from '@invariance/common';
import { InvarianceError } from '../../errors/InvarianceError.js';
import {
  toBytes32,
  fromBytes32,
  waitForReceipt,
  mapContractError,
  policyStateFromEnum,
  mapActorTypesToEnums,
  enumToActorType,
} from '../../utils/contract-helpers.js';
import { IndexerClient } from '../../utils/indexer-client.js';
import { mapPolicyRow } from '../../utils/indexer-mappers.js';
import { serializeRules, deserializeRules } from './rule-serializer.js';
import { X402Manager } from '../x402/X402Manager.js';
import { parseBaseUnitAmount } from '../../utils/amounts.js';
import type {
  CreatePolicyOptions,
  SpecPolicy,
  PolicyStatus,
  EvaluationResult,
  TxReceipt,
  EvaluateOptions,
  PolicyListFilters,
  PolicyViolationCallback,
  OnChainPolicy,
  OnChainPolicyRule,
  PolicyTemplate,
} from './types.js';
import {
  buildPolicyFromTemplate,
  defineTemplate as defineTemplateInternal,
  listTemplates as listTemplatesInternal,
} from './templates.js';
import { keccak256, toHex } from 'viem';

/** Zero bytes32 constant */
const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as const;

/** Event signature hashes for log parsing */
const POLICY_CREATED_EVENT = keccak256(toHex('PolicyCreated(bytes32,string,address,uint256)'));
const POLICY_COMPOSED_EVENT = keccak256(toHex('PolicyComposed(bytes32,bytes32,bytes32)'));

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
  private indexer: IndexerClient | null = null;
  private x402: X402Manager | null = null;

  constructor(
    contracts: ContractFactory,
    events: InvarianceEventEmitter,
    telemetry: Telemetry,
  ) {
    this.contracts = contracts;
    this.events = events;
    this.telemetry = telemetry;
  }

  /** Lazily initialize the X402 manager */
  private getX402Manager(): X402Manager {
    if (!this.x402) {
      this.x402 = new X402Manager(this.contracts, this.events, this.telemetry);
    }
    return this.x402;
  }

  /** Lazily initialize the indexer client */
  private getIndexer(): IndexerClient {
    if (!this.indexer) {
      this.indexer = new IndexerClient(this.contracts.getApiBaseUrl(), this.contracts.getApiKey());
    }
    return this.indexer;
  }

  /** Map an on-chain policy tuple to the SDK SpecPolicy type */
  private mapOnChainPolicy(raw: OnChainPolicy, rules: OnChainPolicyRule[], txHash?: string): SpecPolicy {
    const policyIdStr = fromBytes32(raw.policyId);

    // Map actor types
    let actor: ActorType | ActorType[] | null = null;
    if (raw.applicableActorTypes && raw.applicableActorTypes.length > 0) {
      const actorTypes = Array.from(raw.applicableActorTypes).map((t) => enumToActorType(t));
      actor = actorTypes.length === 1 ? (actorTypes[0] ?? null) : actorTypes;
    }

    return {
      policyId: policyIdStr || raw.policyId,
      name: raw.name,
      rules: deserializeRules(rules),
      actor,
      state: policyStateFromEnum(raw.state),
      attachedTo: [],
      createdAt: Number(raw.createdAt),
      txHash: txHash ?? '',
    };
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
    if (!opts.rules || opts.rules.length === 0) {
      throw new InvarianceError(ErrorCode.POLICY_VIOLATION, 'Policy must have at least one rule.');
    }

    this.telemetry.track('policy.create', { ruleCount: opts.rules.length });

    try {
      const contract = this.contracts.getContract('policy');
      const publicClient = this.contracts.getPublicClient();

      // Serialize rules to on-chain format
      const onChainRules = serializeRules(opts.rules);

      // Map actor types to enums
      let applicableActorTypes: number[] = [];
      if (opts.actor) {
        const actors = Array.isArray(opts.actor) ? opts.actor : [opts.actor];
        applicableActorTypes = mapActorTypesToEnums(actors);
      }

      // Parse expiry
      const expiresAt = opts.expiry ? BigInt(new Date(opts.expiry).getTime() / 1000) : 0n;

      // Call contract
      const createFn = contract.write['create'];
      if (!createFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'create function not found on contract');
      const txHash = await createFn([opts.name, applicableActorTypes, expiresAt, onChainRules]);

      const receipt = await waitForReceipt(publicClient, txHash);

      // Read back the created policy from chain
      // Parse PolicyCreated event to get policyId
      let policyId: `0x${string}` = ZERO_BYTES32;
      for (const log of receipt.logs) {
        if (log.topics[0] === POLICY_CREATED_EVENT) {
          policyId = log.topics[1] as `0x${string}`;
          break;
        }
      }

      // If we couldn't get policyId from event, calculate it
      if (policyId === ZERO_BYTES32) {
        policyId = toBytes32(opts.name);
      }

      const getPolicyFn = contract.read['getPolicy'];
      if (!getPolicyFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'getPolicy function not found on contract');
      const raw = await getPolicyFn([policyId]) as OnChainPolicy;

      const getRulesFn = contract.read['getRules'];
      if (!getRulesFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'getRules function not found on contract');
      const rawRules = await getRulesFn([policyId]) as readonly OnChainPolicyRule[];

      const policy = this.mapOnChainPolicy(raw, Array.from(rawRules), receipt.txHash);

      // Emit event AFTER successful transaction
      this.events.emit('policy.created', {
        policyId: policy.policyId,
        name: opts.name,
      });

      return policy;
    } catch (err) {
      throw mapContractError(err);
    }
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

    try {
      const contract = this.contracts.getContract('policy');
      const publicClient = this.contracts.getPublicClient();

      const policyIdBytes = toBytes32(policyId);
      const identityIdBytes = toBytes32(identityId);

      const attachFn = contract.write['attach'];
      if (!attachFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'attach function not found on contract');
      const txHash = await attachFn([policyIdBytes, identityIdBytes]);

      const receipt = await waitForReceipt(publicClient, txHash);

      // Emit event AFTER successful transaction
      this.events.emit('policy.attached', {
        policyId,
        identityId,
      });

      return {
        txHash: receipt.txHash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        status: receipt.status,
      };
    } catch (err) {
      throw mapContractError(err);
    }
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

    try {
      const contract = this.contracts.getContract('policy');
      const publicClient = this.contracts.getPublicClient();

      const policyIdBytes = toBytes32(policyId);
      const identityIdBytes = toBytes32(identityId);

      const detachFn = contract.write['detach'];
      if (!detachFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'detach function not found on contract');
      const txHash = await detachFn([policyIdBytes, identityIdBytes]);

      const receipt = await waitForReceipt(publicClient, txHash);

      // Emit event AFTER successful transaction
      this.events.emit('policy.detached', {
        policyId,
        identityId,
      });

      return {
        txHash: receipt.txHash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        status: receipt.status,
      };
    } catch (err) {
      throw mapContractError(err);
    }
  }

  /**
   * Check policy state and usage statistics.
   *
   * @param policyId - The policy to check
   * @returns Extended policy status with usage metrics
   */
  async status(policyId: string): Promise<PolicyStatus> {
    this.telemetry.track('policy.status');

    try {
      const contract = this.contracts.getContract('policy');
      const policyIdBytes = toBytes32(policyId);

      const getPolicyFn = contract.read['getPolicy'];
      if (!getPolicyFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'getPolicy function not found on contract');
      const raw = await getPolicyFn([policyIdBytes]) as OnChainPolicy;

      if (raw.policyId === ZERO_BYTES32) {
        throw new InvarianceError(
          ErrorCode.POLICY_VIOLATION,
          `Policy not found: ${policyId}`,
        );
      }

      const getRulesFn = contract.read['getRules'];
      if (!getRulesFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'getRules function not found on contract');
      const rawRules = await getRulesFn([policyIdBytes]) as readonly OnChainPolicyRule[];

      const policy = this.mapOnChainPolicy(raw, Array.from(rawRules));

      // Fetch usage stats from indexer, gracefully degrade to zeros
      let usage = { totalEvaluations: 0, violations: 0, spentByRule: {} as Record<string, string> };
      try {
        const indexer = this.getIndexer();
        const data = await indexer.get<{ totalEvaluations: number; violations: number; spentByRule?: Record<string, string> }>(`/policies/${policyId}/evaluations`);
        usage = {
          totalEvaluations: data.totalEvaluations,
          violations: data.violations,
          spentByRule: data.spentByRule ?? {},
        };
      } catch {
        // Indexer unavailable — use zeros
      }

      const status: PolicyStatus = {
        ...policy,
        usage,
      };

      if (raw.expiresAt > 0n) {
        status.expiresAt = Number(raw.expiresAt);
      }

      return status;
    } catch (err) {
      throw mapContractError(err);
    }
  }

  /**
   * List policies by identity, type, or status.
   *
   * @param filters - Optional filters
   * @returns Array of matching policies
   */
  async list(filters?: PolicyListFilters): Promise<SpecPolicy[]> {
    this.telemetry.track('policy.list', { hasFilters: filters !== undefined });

    const indexer = this.getIndexer();
    const available = await indexer.isAvailable();

    if (available) {
      try {
        const pageSize = Math.max(1, filters?.limit ?? 20);
        const offset = Math.max(0, filters?.offset ?? 0);
        const page = Math.floor(offset / pageSize) + 1;
        const params: Record<string, string | number | undefined> = {
          state: filters?.state,
          creator: filters?.actor,
          page,
          pageSize,
        };
        const rows = await indexer.get<Record<string, unknown>[]>('/policies', params);
        return rows.map((row) => mapPolicyRow(row));
      } catch (err) {
        this.telemetry.track('policy.list.error', { error: String(err) });
      }
    }

    // On-chain fallback: read policyCount and iterate (limited)
    try {
      const contract = this.contracts.getContract('policy');
      const countFn = contract.read['policyCount'];
      if (!countFn) return [];
      const count = await countFn([]) as bigint;
      const _limit = Math.min(Number(count), filters?.limit ?? 50);

      // On-chain sequential reads are expensive, cap at limit
      // NOTE: On-chain fallback is limited and cannot filter efficiently.
      // In production, the indexer should always be available.
      void _limit;
      return [];
    } catch (err) {
      this.telemetry.track('policy.list.fallback.error', { error: String(err) });
      return [];
    }
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

    try {
      const contract = this.contracts.getContract('policy');
      const identityContract = this.contracts.getContract('identity');

      let identityIdBytes: `0x${string}`;
      if (opts.actor.identityId) {
        identityIdBytes = toBytes32(opts.actor.identityId);
      } else {
        const resolveFn = identityContract.read['resolve'];
        if (!resolveFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'resolve function not found');
        identityIdBytes = await resolveFn([opts.actor.address as `0x${string}`]) as `0x${string}`;
      }
      const actionBytes = toBytes32(opts.action);
      const target = (opts.params?.['target'] as string) || '0x0000000000000000000000000000000000000000';
      const value = opts.amount ? parseBaseUnitAmount(opts.amount, 'amount') : 0n;
      const data = (opts.params?.['data'] as `0x${string}`) || '0x';

      const evaluateFn = contract.read['evaluate'];
      if (!evaluateFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'evaluate function not found on contract');
      const result = await evaluateFn([identityIdBytes, actionBytes, target as `0x${string}`, value, data]) as [boolean, `0x${string}`];

      let [allowed] = result;
      const ruleResults: { type: import('@invariance/common').PolicyRuleType; passed: boolean; detail: string; remaining?: string }[] = [];

      // Check for require-payment rules in the policy
      const policyIdBytes = toBytes32(opts.policyId);
      const getRulesFn = contract.read['getRules'];
      if (getRulesFn) {
        try {
          const rawRules = await getRulesFn([policyIdBytes]) as readonly OnChainPolicyRule[];
          const rules = deserializeRules(Array.from(rawRules));

          for (const rule of rules) {
            if (rule.type === 'require-payment') {
              const config = rule.config as { minAmount?: string; exemptActions?: string[] };
              const exemptActions = config.exemptActions ?? [];

              if (exemptActions.includes(opts.action)) {
                ruleResults.push({
                  type: 'require-payment',
                  passed: true,
                  detail: `Action "${opts.action}" is exempt from payment requirement`,
                });
                continue;
              }

              if (!opts.paymentReceiptId) {
                allowed = false;
                ruleResults.push({
                  type: 'require-payment',
                  passed: false,
                  detail: 'Payment required but no receipt provided',
                });
                continue;
              }

              // Verify payment receipt
              const x402 = this.getX402Manager();
              const verification = await x402.verifyPayment(opts.paymentReceiptId);
              const passed = verification.valid;

              if (!passed) {
                allowed = false;
              }

              ruleResults.push({
                type: 'require-payment',
                passed,
                detail: passed
                  ? `Payment verified: ${opts.paymentReceiptId}`
                  : `Payment verification failed: ${verification.reason}`,
              });
            }
          }
        } catch (err) {
          // Only swallow contract-read errors (e.g. function not found).
          // Rethrow network/RPC errors that indicate a real problem.
          const errMsg = err instanceof Error ? err.message : String(err);
          if (errMsg.includes('network') || errMsg.includes('timeout') || errMsg.includes('ECONNREFUSED') || errMsg.includes('fetch failed')) {
            throw new InvarianceError(
              ErrorCode.NETWORK_ERROR,
              `Failed to read policy rules for payment verification: ${errMsg}`,
            );
          }
          this.telemetry.track('policy.evaluate.ruleReadSkipped', { error: errMsg });
        }
      }

      return {
        allowed,
        policyId: opts.policyId,
        ruleResults,
      };
    } catch (err) {
      throw mapContractError(err);
    }
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

    try {
      const contract = this.contracts.getContract('policy');
      const publicClient = this.contracts.getPublicClient();

      const policyIdBytes = toBytes32(policyId);

      const revokeFn = contract.write['revoke'];
      if (!revokeFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'revoke function not found on contract');
      const txHash = await revokeFn([policyIdBytes]);

      const receipt = await waitForReceipt(publicClient, txHash);

      // Emit event AFTER successful transaction
      this.events.emit('policy.revoked', {
        policyId,
      });

      return {
        txHash: receipt.txHash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        status: receipt.status,
      };
    } catch (err) {
      throw mapContractError(err);
    }
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

    try {
      if (policyIds.length < 2) {
        throw new InvarianceError(
          ErrorCode.POLICY_VIOLATION,
          'compose() requires at least 2 policy IDs',
        );
      }

      if (policyIds.length > 2) {
        throw new InvarianceError(
          ErrorCode.POLICY_VIOLATION,
          `compose() supports exactly 2 policy IDs, got ${policyIds.length}. Chain multiple compose() calls for more.`,
        );
      }

      const contract = this.contracts.getContract('policy');
      const publicClient = this.contracts.getPublicClient();

      const rawIdA = policyIds[0];
      const rawIdB = policyIds[1];
      if (!rawIdA || !rawIdB) {
        throw new InvarianceError(
          ErrorCode.INVALID_INPUT,
          'compose() requires two non-empty policy IDs',
        );
      }
      const policyIdA = toBytes32(rawIdA);
      const policyIdB = toBytes32(rawIdB);

      // Generate composite name
      const name = `Composite Policy (${policyIds.length} policies)`;

      const composeFn = contract.write['compose'];
      if (!composeFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'compose function not found on contract');
      const txHash = await composeFn([name, policyIdA, policyIdB, 0n]);

      const receipt = await waitForReceipt(publicClient, txHash);

      // Parse PolicyComposed event to get newPolicyId
      let newPolicyId: `0x${string}` = ZERO_BYTES32;
      for (const log of receipt.logs) {
        if (log.topics[0] === POLICY_COMPOSED_EVENT) {
          newPolicyId = log.topics[1] as `0x${string}`;
          break;
        }
      }

      // If we couldn't get policyId from event, calculate it
      if (newPolicyId === ZERO_BYTES32) {
        newPolicyId = toBytes32(name);
      }

      // Read back the composed policy
      const getPolicyFn = contract.read['getPolicy'];
      if (!getPolicyFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'getPolicy function not found on contract');
      const raw = await getPolicyFn([newPolicyId]) as OnChainPolicy;

      const getRulesFn = contract.read['getRules'];
      if (!getRulesFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'getRules function not found on contract');
      const rawRules = await getRulesFn([newPolicyId]) as readonly OnChainPolicyRule[];

      const policy = this.mapOnChainPolicy(raw, Array.from(rawRules), receipt.txHash);

      // Emit event AFTER successful transaction
      this.events.emit('policy.composed', {
        policyId: policy.policyId,
        name: policy.name,
      });

      return policy;
    } catch (err) {
      throw mapContractError(err);
    }
  }

  /**
   * Create a policy from a pre-built template.
   *
   * @param templateName - Name of the template (e.g. 'defi-trading')
   * @param overrides - Optional overrides for expiry, actor, or additional rules
   * @returns The created policy
   *
   * @example
   * ```typescript
   * const policy = await inv.policy.fromTemplate('defi-trading', { expiry: '2025-12-31' });
   * ```
   */
  async fromTemplate(
    templateName: string,
    overrides?: { expiry?: string; actor?: import('@invariance/common').ActorType | import('@invariance/common').ActorType[]; additionalRules?: import('@invariance/common').PolicyRule[] },
  ): Promise<SpecPolicy> {
    if (templateName === 'full-autonomy') {
      console.warn('[Invariance] WARNING: "full-autonomy" template grants high limits with minimal restrictions. Use with caution.');
    }
    const opts = buildPolicyFromTemplate(templateName, overrides);
    return this.create(opts);
  }

  /**
   * Register a custom policy template.
   *
   * @param name - Template name
   * @param template - Template definition with description and rules
   *
   * @example
   * ```typescript
   * inv.policy.defineTemplate('my-custom', {
   *   description: 'Custom policy for my use case',
   *   rules: [{ type: 'max-spend', config: { amount: '500' } }],
   * });
   * ```
   */
  defineTemplate(name: string, template: Omit<PolicyTemplate, 'name' | 'builtin'>): void {
    defineTemplateInternal(name, template);
  }

  /**
   * List all available policy templates (built-in + custom).
   *
   * @returns Array of template metadata
   */
  listTemplates(): Array<{ name: string; description: string; builtin: boolean }> {
    return listTemplatesInternal();
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
