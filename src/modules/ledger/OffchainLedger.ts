import type { LedgerAdapter, LedgerEventInput, LedgerQueryFilters, OffchainLedgerEntry } from '@invariance/common';
import type { InvarianceEventEmitter } from '../../core/EventEmitter.js';
import type { Telemetry } from '../../core/Telemetry.js';

/**
 * Off-chain ledger backed by a pluggable {@link LedgerAdapter}.
 *
 * Same `LedgerEventInput` interface as on-chain `EventLedger`, zero gas.
 *
 * @example
 * ```typescript
 * const entry = await inv.ledgerOffchain.log({
 *   action: 'model-inference',
 *   actor: { type: 'agent', address: '0xBot' },
 *   metadata: { model: 'claude-sonnet', latencyMs: 230 },
 * });
 *
 * const entries = await inv.ledgerOffchain.query({
 *   actor: '0xBot',
 *   action: 'model-inference',
 *   limit: 50,
 * });
 * ```
 */
export class OffchainLedger {
  private readonly events: InvarianceEventEmitter;
  private readonly telemetry: Telemetry;
  private readonly failOpen: boolean;
  private readonly adapter: LedgerAdapter;

  constructor(
    events: InvarianceEventEmitter,
    telemetry: Telemetry,
    options: { adapter: LedgerAdapter; failOpen?: boolean },
  ) {
    this.events = events;
    this.telemetry = telemetry;
    this.adapter = options.adapter;
    this.failOpen = options.failOpen ?? true;
  }

  /**
   * Log a ledger event.
   *
   * @param event - Same `LedgerEventInput` used by on-chain ledger
   * @returns The created off-chain ledger entry
   */
  async log(event: LedgerEventInput): Promise<OffchainLedgerEntry> {
    this.telemetry.track('offchain_ledger.log', { action: event.action });

    const entryId = crypto.randomUUID();
    const timestamp = Date.now();
    const category = event.category ?? 'custom';
    const severity = event.severity ?? 'info';

    const entry: OffchainLedgerEntry = {
      entryId,
      action: event.action,
      actor: event.actor,
      category,
      severity,
      timestamp,
      createdAt: new Date(timestamp).toISOString(),
    };
    if (event.metadata) {
      entry.metadata = event.metadata;
    }

    try {
      const persisted = await this.adapter.insert(entry);
      this.events.emit('ledger.logged', { entryId: persisted.entryId, action: persisted.action });
      return persisted;
    } catch (err) {
      if (this.failOpen) {
        this.events.emit('ledger.logged', { entryId: entry.entryId, action: entry.action });
        return entry;
      }
      throw err;
    }
  }

  /**
   * Query off-chain ledger entries.
   *
   * @param filters - Same `LedgerQueryFilters` used by on-chain ledger
   * @returns Matching off-chain ledger entries
   */
  async query(filters: LedgerQueryFilters): Promise<OffchainLedgerEntry[]> {
    this.telemetry.track('offchain_ledger.query', { action: filters.action });

    try {
      return await this.adapter.query(filters);
    } catch (err) {
      if (this.failOpen) {
        return [];
      }
      throw err;
    }
  }
}
