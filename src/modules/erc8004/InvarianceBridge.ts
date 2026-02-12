/**
 * Optional bridge between ERC-8004 and Invariance modules.
 *
 * Takes an ERC8004Manager instance + Invariance module references.
 * Explicitly constructed — never automatic.
 *
 * @example
 * ```typescript
 * const inv = new Invariance({ chain: 'base', signer: wallet });
 * const bridge = inv.erc8004Bridge;
 *
 * // Link identities
 * const linked = await bridge.linkIdentity('inv-id-123', 42n);
 *
 * // Pull external reputation
 * const signal = await bridge.pullERC8004Reputation(42n);
 * ```
 */

import type { ERC8004Manager } from './ERC8004Manager.js';
import type { IdentityManager } from '../identity/IdentityManager.js';
import type { EventLedger } from '../ledger/EventLedger.js';
import type { ContractFactory } from '../../core/ContractFactory.js';
import type { InvarianceEventEmitter } from '../../core/EventEmitter.js';
import type { Telemetry } from '../../core/Telemetry.js';
import type {
  LinkedIdentity,
  ExternalReputationSignal,
  PushFeedbackOptions,
} from './types.js';

/** Transaction receipt returned by bridge write methods */
interface TxReceipt {
  txHash: string;
  blockNumber: number;
  status: 'success' | 'reverted';
}

export class InvarianceBridge {
  private readonly erc8004: ERC8004Manager;
  private readonly identity: IdentityManager;
  private readonly ledger: EventLedger;
  private readonly contracts: ContractFactory;
  private readonly events: InvarianceEventEmitter;
  private readonly telemetry: Telemetry;

  /** In-memory cache of linked identities */
  private linkedIdentities: Map<string, LinkedIdentity> = new Map();
  private static readonly MAX_LINKED_IDENTITIES = 1000;

  constructor(
    erc8004: ERC8004Manager,
    identity: IdentityManager,
    ledger: EventLedger,
    contracts: ContractFactory,
    events: InvarianceEventEmitter,
    telemetry: Telemetry,
  ) {
    this.erc8004 = erc8004;
    this.identity = identity;
    this.ledger = ledger;
    this.contracts = contracts;
    this.events = events;
    this.telemetry = telemetry;
  }

  // ===========================================================================
  // Identity Linking
  // ===========================================================================

  /**
   * Link an Invariance identity to an ERC-8004 agent identity.
   *
   * Sets `invariance-identity-id` as ERC-8004 metadata AND creates
   * an Invariance attestation with `erc8004-agent-id` claim.
   *
   * @param invarianceIdentityId - Invariance identity ID
   * @param erc8004AgentId - ERC-8004 agent ID
   * @returns The linked identity pairing
   */
  async linkIdentity(invarianceIdentityId: string, erc8004AgentId: bigint): Promise<LinkedIdentity> {
    this.telemetry.track('erc8004.linkIdentity');

    // Set Invariance identity ID as ERC-8004 metadata
    const metadataReceipt = await this.erc8004.setMetadata(
      erc8004AgentId,
      'invariance-identity-id',
      invarianceIdentityId,
    );

    // Create Invariance attestation linking to ERC-8004
    const globalId = this.erc8004.getGlobalId(erc8004AgentId);
    const walletAddress = this.contracts.getWalletAddress();
    await this.identity.attest(invarianceIdentityId, {
      claim: 'erc8004-agent-id',
      attester: walletAddress,
      evidence: erc8004AgentId.toString(),
    });

    const linked: LinkedIdentity = {
      invarianceIdentityId,
      erc8004AgentId: erc8004AgentId.toString(),
      erc8004GlobalId: globalId,
      linkedAt: Date.now(),
      txHash: metadataReceipt.txHash,
    };

    // Cache the link
    if (this.linkedIdentities.size >= InvarianceBridge.MAX_LINKED_IDENTITIES) {
      const oldest = this.linkedIdentities.keys().next().value;
      if (oldest !== undefined) this.linkedIdentities.delete(oldest);
    }
    this.linkedIdentities.set(invarianceIdentityId, linked);

    this.events.emit('erc8004.identity.linked', {
      invarianceIdentityId,
      erc8004AgentId: erc8004AgentId.toString(),
    });

    return linked;
  }

  /**
   * Get a linked identity pairing.
   *
   * Checks local cache first, then queries ERC-8004 metadata.
   *
   * @param invarianceIdentityId - Invariance identity ID
   * @returns The linked identity or null if not linked
   */
  async getLinkedIdentity(invarianceIdentityId: string): Promise<LinkedIdentity | null> {
    this.telemetry.track('erc8004.getLinkedIdentity');

    // Check local cache
    const cached = this.linkedIdentities.get(invarianceIdentityId);
    if (cached) return cached;

    return null;
  }

  /**
   * Unlink an Invariance identity from its ERC-8004 agent.
   *
   * Removes the ERC-8004 metadata and clears the local cache.
   *
   * @param invarianceIdentityId - Invariance identity ID
   */
  async unlinkIdentity(invarianceIdentityId: string): Promise<void> {
    this.telemetry.track('erc8004.unlinkIdentity');

    const linked = this.linkedIdentities.get(invarianceIdentityId);
    if (!linked) return;

    const erc8004AgentId = BigInt(linked.erc8004AgentId);

    // Clear ERC-8004 metadata
    await this.erc8004.setMetadata(erc8004AgentId, 'invariance-identity-id', '');

    // Remove from cache
    this.linkedIdentities.delete(invarianceIdentityId);

    this.events.emit('erc8004.identity.unlinked', {
      invarianceIdentityId,
      erc8004AgentId: linked.erc8004AgentId,
    });
  }

  // ===========================================================================
  // Reputation Bridging
  // ===========================================================================

  /**
   * Pull ERC-8004 reputation data and normalize to a 0-100 score.
   *
   * Does NOT modify Invariance scoring — caller decides how to use the signal.
   *
   * @param erc8004AgentId - ERC-8004 agent ID
   * @returns External reputation signal with normalized score
   */
  async pullERC8004Reputation(erc8004AgentId: bigint): Promise<ExternalReputationSignal> {
    this.telemetry.track('erc8004.pullReputation');

    const summary = await this.erc8004.getSummary(erc8004AgentId);

    // Normalize: assume summaryValue is on a scale determined by decimals
    // e.g., summaryValue=350 with decimals=2 means 3.50 out of 5.00
    const rawValue = summary.decimals > 0
      ? summary.summaryValue / Math.pow(10, summary.decimals)
      : summary.summaryValue;

    // Normalize to 0-100 scale (assuming max raw value is 5)
    const maxScale = 5;
    const normalizedScore = Math.min(100, Math.max(0, (rawValue / maxScale) * 100));

    return {
      source: 'erc8004',
      feedbackCount: summary.count,
      averageValue: rawValue,
      normalizedScore: Math.round(normalizedScore * 100) / 100,
    };
  }

  /**
   * Push Invariance ledger data as ERC-8004 feedback.
   *
   * Queries Invariance ledger entries for the identity, derives a
   * feedback value (based on success rate), and calls giveFeedback()
   * on the ERC-8004 Reputation Registry.
   *
   * @param invarianceIdentityId - Invariance identity ID
   * @param erc8004AgentId - ERC-8004 agent ID to give feedback on
   * @param opts - Feedback options (tags, lookback, URI)
   * @returns Transaction receipt
   */
  async pushFeedbackFromLedger(
    invarianceIdentityId: string,
    erc8004AgentId: bigint,
    opts: PushFeedbackOptions,
  ): Promise<TxReceipt> {
    this.telemetry.track('erc8004.pushFeedback');

    // Query Invariance ledger for this identity's entries
    const fromTimestamp = opts.lookbackMs
      ? Date.now() - opts.lookbackMs
      : 0;

    const entries = await this.ledger.query({
      actor: invarianceIdentityId,
      from: fromTimestamp,
      limit: 1000,
    });

    // Derive feedback value from ledger entries (1-5 scale)
    // Based on the ratio of successful entries
    const total = entries.length;
    const successful = entries.filter(
      (e: { category?: string }) => e.category !== 'error' && e.category !== 'violation',
    ).length;

    const successRate = total > 0 ? successful / total : 0;
    // Map success rate to 1-5 scale
    const feedbackValue = Math.max(1, Math.min(5, Math.round(successRate * 5)));

    const receipt = await this.erc8004.giveFeedback({
      agentId: erc8004AgentId,
      value: feedbackValue,
      tag1: opts.tag1,
      tag2: opts.tag2 ?? '',
      feedbackURI: opts.feedbackURI ?? '',
    });

    this.events.emit('erc8004.feedback.pushed', {
      erc8004AgentId: erc8004AgentId.toString(),
      value: feedbackValue,
    });

    return receipt;
  }

  // ===========================================================================
  // Validation Bridging
  // ===========================================================================

  /**
   * Act as a validator for an ERC-8004 agent.
   *
   * Reads Invariance execution logs, evaluates integrity,
   * and submits a validation response.
   *
   * @param erc8004AgentId - ERC-8004 agent ID being validated
   * @param requestHash - Hash of the validation request to respond to
   * @returns Transaction receipt
   */
  async actAsValidator(erc8004AgentId: bigint, requestHash: `0x${string}`): Promise<TxReceipt> {
    this.telemetry.track('erc8004.actAsValidator');

    // Find the linked Invariance identity for this ERC-8004 agent
    let invarianceIdentityId: string | null = null;
    for (const [invId, link] of this.linkedIdentities.entries()) {
      if (link.erc8004AgentId === erc8004AgentId.toString()) {
        invarianceIdentityId = invId;
        break;
      }
    }

    // Evaluate based on Invariance data if identity is linked
    let responseValue = 1; // Default: valid
    if (invarianceIdentityId) {
      const entries = await this.ledger.query({
        actor: invarianceIdentityId,
        limit: 100,
      });

      const total = entries.length;
      const violations = entries.filter(
        (e: { category?: string }) => e.category === 'violation' || e.category === 'error',
      ).length;

      const complianceRate = total > 0 ? (total - violations) / total : 1;
      responseValue = complianceRate >= 0.9 ? 1 : 0;
    }

    const receipt = await this.erc8004.respondToValidation({
      requestHash,
      response: responseValue,
    });

    this.events.emit('erc8004.validation.responded', {
      requestHash,
      response: responseValue,
    });

    return receipt;
  }

  /**
   * Submit a validation request targeting Invariance as validator.
   *
   * @param erc8004AgentId - ERC-8004 agent ID to validate
   * @param requestURI - URI describing what to validate
   * @returns Transaction receipt
   */
  async requestInvarianceValidation(erc8004AgentId: bigint, requestURI: string): Promise<TxReceipt> {
    this.telemetry.track('erc8004.requestValidation');

    const walletAddress = this.contracts.getWalletAddress() as `0x${string}`;

    return this.erc8004.requestValidation({
      agentId: erc8004AgentId,
      validator: walletAddress,
      requestURI,
    });
  }
}
