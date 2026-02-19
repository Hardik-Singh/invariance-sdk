/**
 * Session context that binds an actor to all operations,
 * eliminating repetitive actor passing.
 *
 * @example
 * ```typescript
 * const session = inv.session({ actor: { type: 'agent', address: '0xBot' } });
 * await session.requestIntent({ action: 'swap', params: {...} });
 * await session.myActions({ limit: 50 });
 * ```
 */
import type { Invariance } from './InvarianceClient.js';
import type { ActorReference, IntentRequestOptions, IntentResult, LedgerEntry, SpecPolicy, AuditLogRecord } from '@invariance/common';
import type { SessionOptions } from './convenience-types.js';
import type { IntentHistoryFilters } from '../modules/intent/types.js';
import type { LedgerQueryFilters } from '../modules/ledger/types.js';
import type { PolicyListFilters } from '../modules/policy/types.js';
import type { OffchainLogOptions } from './convenience-types.js';

/**
 * A session scoped to a specific actor.
 *
 * All operations automatically use the bound actor, removing the need
 * to pass actor references repeatedly.
 */
export class SessionContext {
  private readonly inv: Invariance;
  /** The actor bound to this session */
  readonly actor: ActorReference;

  constructor(inv: Invariance, options: SessionOptions) {
    this.inv = inv;
    this.actor = options.actor;
  }

  /**
   * Request an intent with the session actor pre-filled.
   *
   * @param opts - Intent options (actor is auto-filled)
   * @returns Intent result
   */
  async requestIntent(opts: Omit<IntentRequestOptions, 'actor'>): Promise<IntentResult> {
    return this.inv.intent.request({ ...opts, actor: this.actor });
  }

  /**
   * Query the session actor's action history.
   *
   * @param filters - Optional additional filters
   * @returns Array of intent results
   */
  async myActions(filters?: Omit<IntentHistoryFilters, 'actor'>): Promise<IntentResult[]> {
    return this.inv.intent.history({ ...filters, actor: this.actor.address });
  }

  /**
   * Query ledger entries for the session actor.
   *
   * @param filters - Optional additional filters
   * @returns Array of ledger entries
   */
  async myLedgerEntries(filters?: Omit<LedgerQueryFilters, 'actor'>): Promise<LedgerEntry[]> {
    return this.inv.ledger.query({ ...filters, actor: this.actor.address });
  }

  /**
   * List policies attached to the session actor's identity.
   *
   * @param filters - Optional additional filters
   * @returns Array of policies
   */
  async myPolicies(filters?: Omit<PolicyListFilters, 'identityId'>): Promise<SpecPolicy[]> {
    return this.inv.policy.list({ ...filters, identityId: this.actor.address });
  }

  /**
   * Write an off-chain log entry bound to the session actor.
   *
   * @param action - Action identifier
   * @param options - Additional off-chain log options
   * @returns Off-chain log write result
   */
  async logOffchain(
    action: string,
    options?: Omit<OffchainLogOptions, 'action' | 'actor'>,
  ): Promise<import('./convenience-types.js').OffchainLogResult> {
    return this.inv.logOffchain(action, { ...options, actor: this.actor });
  }

  /**
   * Query off-chain logs for the session actor.
   *
   * @param filters - Optional additional query filters
   * @returns Matching off-chain logs and total count
   */
  async myOffchainLogs(
    filters?: Omit<import('./convenience-types.js').OffchainLogQuery, 'actor'>,
  ): Promise<{ data: AuditLogRecord[]; total: number }> {
    return this.inv.queryOffchainLogs({ ...filters, actor: this.actor.address });
  }
}
