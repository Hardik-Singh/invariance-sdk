/**
 * Beneficiary-gated bot registration + extraction logging.
 * Serves: MEV bots, DeFi arbitrage, liquidation systems.
 *
 * @example
 * ```typescript
 * const mev = new MEVComplianceKit(inv);
 * const bot = await mev.registerBot({
 *   identity: { type: 'agent', owner: '0xDev', label: 'ArbBot-1' },
 *   beneficiaries: ['0xTreasury', '0xDAO'],
 *   maxExtractionPerTx: '1000',
 *   maxDailyExtraction: '50000',
 *   allowedStrategies: ['arbitrage', 'liquidation'],
 * });
 * ```
 */
import type { Invariance } from '../core/InvarianceClient.js';
import type { Identity } from '../modules/identity/types.js';
import type { SpecPolicy, PolicyRule } from '@invariance/common';

/** MEV bot registration options */
export interface RegisterBotOptions {
  /** Bot identity details */
  identity: {
    type: 'agent';
    owner: string;
    label: string;
    metadata?: Record<string, unknown>;
  };
  /** Allowed beneficiary addresses */
  beneficiaries: string[];
  /** Maximum extraction per transaction */
  maxExtractionPerTx?: string;
  /** Maximum daily extraction */
  maxDailyExtraction?: string;
  /** Allowed MEV strategies */
  allowedStrategies?: string[];
}

/** Registered bot result */
export interface RegisteredBot {
  /** Bot identity */
  identity: Identity;
  /** Attached compliance policy */
  policy: SpecPolicy;
  /** Registered beneficiaries */
  beneficiaries: string[];
}

/** MEV extraction log entry */
export interface ExtractionLog {
  /** Ledger entry ID */
  entryId: string;
  /** Transaction hash */
  txHash: string;
  /** Strategy used */
  strategy: string;
  /** Amount extracted (USDC) */
  amount: string;
  /** Beneficiary address */
  beneficiary: string;
  /** Timestamp */
  timestamp: number;
}

/**
 * MEVComplianceKit — beneficiary-gated bot registration + extraction logging.
 */
export class MEVComplianceKit {
  private readonly client: Invariance;
  private readonly beneficiaryRegistry = new Map<string, Set<string>>();

  constructor(client: Invariance) {
    this.client = client;
  }

  /**
   * Register a MEV bot with beneficiary gates and extraction limits.
   */
  async registerBot(opts: RegisterBotOptions): Promise<RegisteredBot> {
    const identity = await this.client.identity.register(opts.identity);

    const rules: PolicyRule[] = [];
    if (opts.maxExtractionPerTx) {
      rules.push({ type: 'max-spend', config: { amount: opts.maxExtractionPerTx } });
    }
    if (opts.maxDailyExtraction) {
      rules.push({ type: 'max-spend', config: { amount: opts.maxDailyExtraction, period: '24h' } });
    }
    if (opts.allowedStrategies) {
      rules.push({ type: 'action-whitelist', config: { actions: opts.allowedStrategies } });
    }

    const policy = await this.client.policy.create({
      name: `mev-compliance-${opts.identity.label}`,
      rules,
    });

    await this.client.policy.attach(policy.policyId, identity.identityId);
    this.beneficiaryRegistry.set(identity.identityId, new Set(opts.beneficiaries));

    await this.client.identity.attest(identity.identityId, {
      key: 'mev:beneficiaries',
      value: JSON.stringify(opts.beneficiaries),
    });

    return { identity, policy, beneficiaries: opts.beneficiaries };
  }

  /**
   * Verify that an extraction targets an approved beneficiary.
   */
  isBeneficiaryApproved(botIdentityId: string, beneficiary: string): boolean {
    return this.beneficiaryRegistry.get(botIdentityId)?.has(beneficiary) ?? false;
  }

  /**
   * Log an MEV extraction event to the immutable ledger.
   */
  async logExtraction(
    botIdentityId: string,
    extraction: { strategy: string; amount: string; beneficiary: string; metadata?: Record<string, unknown> },
  ): Promise<ExtractionLog> {
    if (!this.isBeneficiaryApproved(botIdentityId, extraction.beneficiary)) {
      throw new Error(`Beneficiary '${extraction.beneficiary}' not approved for bot '${botIdentityId}'`);
    }

    const bot = await this.client.identity.get(botIdentityId);
    const entry = await this.client.ledger.log({
      action: 'mev-extraction',
      actor: { type: 'agent' as const, address: bot.address },
      category: 'custom',
      metadata: {
        strategy: extraction.strategy,
        amount: extraction.amount,
        beneficiary: extraction.beneficiary,
        botIdentityId,
        ...extraction.metadata,
      },
    });

    return {
      entryId: entry.entryId,
      txHash: entry.txHash,
      strategy: extraction.strategy,
      amount: extraction.amount,
      beneficiary: extraction.beneficiary,
      timestamp: Date.now(),
    };
  }

  /**
   * Add a beneficiary to an existing bot.
   */
  addBeneficiary(botIdentityId: string, beneficiary: string): void {
    if (!this.beneficiaryRegistry.has(botIdentityId)) {
      this.beneficiaryRegistry.set(botIdentityId, new Set());
    }
    this.beneficiaryRegistry.get(botIdentityId)!.add(beneficiary);
  }

  /**
   * Remove a beneficiary from an existing bot.
   */
  removeBeneficiary(botIdentityId: string, beneficiary: string): boolean {
    return this.beneficiaryRegistry.get(botIdentityId)?.delete(beneficiary) ?? false;
  }

  /**
   * Get all approved beneficiaries for a bot.
   */
  getBeneficiaries(botIdentityId: string): string[] {
    return [...(this.beneficiaryRegistry.get(botIdentityId) ?? [])];
  }
}
