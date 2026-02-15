/**
 * Escrow with cross-chain policy enforcement.
 *
 * @example
 * ```typescript
 * const xEscrow = new CrossChainEscrow(inv);
 * const result = await xEscrow.create({
 *   sourceChain: 'base',
 *   destinationChain: 'optimism',
 *   amount: '5000',
 *   recipient: { type: 'agent', address: '0xAgent' },
 *   perChainCap: '2500',
 * });
 * ```
 */
import type { Invariance } from '../core/InvarianceClient.js';
import type { EscrowContract, CreateEscrowOptions } from '../modules/escrow/types.js';
import type { SpecPolicy, PolicyRule } from '@invariance/common';

/** Supported chain identifiers */
export type ChainId = 'base' | 'base-sepolia' | 'ethereum' | 'optimism' | 'arbitrum';

/** Cross-chain escrow configuration */
export interface CrossChainEscrowOptions {
  /** Source chain where escrow is created */
  sourceChain: ChainId;
  /** Destination chain for the bridged action */
  destinationChain: ChainId;
  /** Escrow amount in USDC */
  amount: string;
  /** Recipient actor reference */
  recipient: { type: string; address: string };
  /** Per-chain spending cap */
  perChainCap?: string;
  /** Allowed bridge actions */
  allowedActions?: string[];
  /** Additional policy rules */
  additionalRules?: PolicyRule[];
  /** Escrow timeout (ISO 8601 duration) */
  timeout?: string;
}

/** Result of cross-chain escrow creation */
export interface CrossChainEscrowResult {
  /** Created escrow on source chain */
  escrow: EscrowContract;
  /** Attached bridge policy */
  policy: SpecPolicy;
  /** Source chain */
  sourceChain: ChainId;
  /** Destination chain */
  destinationChain: ChainId;
}

/**
 * CrossChainEscrow — escrow with cross-chain policy enforcement.
 */
export class CrossChainEscrow {
  private readonly client: Invariance;

  constructor(client: Invariance) {
    this.client = client;
  }

  /**
   * Create an escrow on the source chain with bridge-specific policy enforcement.
   */
  async create(opts: CrossChainEscrowOptions): Promise<CrossChainEscrowResult> {
    const rules: PolicyRule[] = [
      { type: 'max-spend', config: { amount: opts.perChainCap ?? opts.amount, period: '24h' } },
      {
        type: 'action-whitelist',
        config: { actions: opts.allowedActions ?? ['bridge', 'swap', 'approve', 'claim', 'query'] },
      },
    ];

    if (opts.additionalRules) {
      rules.push(...opts.additionalRules);
    }

    const policy = await this.client.policy.create({
      name: `xchain-${opts.sourceChain}-to-${opts.destinationChain}-${Date.now()}`,
      rules,
    });

    const escrow = await this.client.escrow.create({
      amount: opts.amount,
      recipient: opts.recipient as CreateEscrowOptions['recipient'],
      conditions: {
        type: 'manual',
        timeout: opts.timeout ?? 'P7D',
      },
    });

    return {
      escrow,
      policy,
      sourceChain: opts.sourceChain,
      destinationChain: opts.destinationChain,
    };
  }

  /**
   * Verify that a cross-chain action complies with the attached policy.
   */
  async verifyAction(
    policyId: string,
    action: string,
    actor: { type: string; address: string },
    params?: Record<string, unknown>,
  ): Promise<{ allowed: boolean; reason?: string }> {
    const evaluation = await this.client.policy.evaluate({
      policyId,
      actor: actor as Parameters<Invariance['policy']['evaluate']>[0]['actor'],
      action,
      params,
    });

    return {
      allowed: evaluation.allowed,
      reason: evaluation.allowed ? undefined : evaluation.reason,
    };
  }
}
