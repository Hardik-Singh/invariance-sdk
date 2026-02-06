import type { ContractFactory } from '../../core/ContractFactory.js';
import type { InvarianceEventEmitter } from '../../core/EventEmitter.js';
import type { Telemetry } from '../../core/Telemetry.js';
import { ErrorCode } from '@invariance/common';
import type { Unsubscribe } from '@invariance/common';
import { InvarianceError } from '../../errors/InvarianceError.js';
import type {
  LedgerEventInput,
  LedgerEntry,
  LedgerQueryFilters,
  ExportData,
  LedgerStreamCallback,
} from './types.js';

/**
 * Immutable on-chain logging with dual signatures.
 *
 * The Event Ledger is the single source of truth for all Invariance actions.
 * Every intent, every escrow state change, every policy evaluation is logged
 * here with dual signatures. This is a Truth Ledger that produces identical
 * proof records regardless of actor type.
 *
 * @example
 * ```typescript
 * const entry = await inv.ledger.log({
 *   action: 'model-inference',
 *   actor: { type: 'agent', address: '0xMyAgent' },
 *   metadata: { model: 'claude-sonnet', latencyMs: 230 },
 * });
 * console.log(entry.explorerUrl);
 * ```
 */
export class EventLedger {
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

  /** Get the contract address for the ledger module */
  getContractAddress(): string {
    return this.contracts.getAddress('ledger');
  }

  /**
   * Log a custom event on-chain.
   *
   * Creates an immutable ledger entry with dual signatures (actor + platform),
   * metadata hash, and a public explorer URL.
   *
   * @param event - The event to log
   * @returns The created ledger entry with proof bundle
   */
  async log(event: LedgerEventInput): Promise<LedgerEntry> {
    this.telemetry.track('ledger.log', {
      action: event.action,
      category: event.category ?? 'custom',
    });

    // TODO: Submit to InvarianceLedger contract
    // 1. Hash metadata
    // 2. Generate actor signature
    // 3. Call ledger.log(action, actor, category, metadataHash, severity)
    // 4. Generate platform co-signature
    // 5. Parse LedgerEntryCreated event
    this.events.emit('ledger.logged', {
      entryId: 'pending',
      action: event.action,
    });

    throw new InvarianceError(
      ErrorCode.TX_REVERTED,
      'Ledger logging not yet implemented. Contract integration required.',
    );
  }

  /**
   * Log multiple events in a single transaction.
   *
   * More gas-efficient than individual log() calls when
   * logging multiple related events.
   *
   * @param events - Array of events to log
   * @returns Array of created ledger entries
   */
  async batch(events: LedgerEventInput[]): Promise<LedgerEntry[]> {
    this.telemetry.track('ledger.batch', { count: events.length });

    // TODO: Submit batch to InvarianceLedger contract
    // 1. Serialize all events
    // 2. Call ledger.batchLog(events[])
    // 3. Parse all emitted events
    throw new InvarianceError(
      ErrorCode.TX_REVERTED,
      'Batch ledger logging not yet implemented. Contract integration required.',
    );
  }

  /**
   * Query ledger entries by identity, action, or time range.
   *
   * @param filters - Query filters (actor, action, category, time range)
   * @returns Array of matching ledger entries
   */
  async query(_filters: LedgerQueryFilters): Promise<LedgerEntry[]> {
    this.telemetry.track('ledger.query', { hasFilters: true });

    // TODO: Query indexer API with filters
    return [];
  }

  /**
   * Stream ledger entries in real-time.
   *
   * Subscribes to new ledger entries matching the given filters
   * and invokes the callback for each new entry.
   *
   * @param filters - Optional filters for the stream
   * @param callback - Called for each new matching entry
   * @returns Unsubscribe function
   */
  stream(_filters: LedgerQueryFilters, _callback: LedgerStreamCallback): Unsubscribe {
    this.telemetry.track('ledger.stream');

    // TODO: Subscribe to InvarianceLedger contract events via WebSocket
    // Filter events based on provided filters
    return () => {
      // No-op: streaming not yet implemented
    };
  }

  /**
   * Export ledger entries as JSON or CSV.
   *
   * @param filters - Query filters to select entries for export
   * @returns Exported data in the requested format
   */
  async export(_filters: LedgerQueryFilters): Promise<ExportData> {
    this.telemetry.track('ledger.export');

    // TODO: Query indexer and format as JSON/CSV
    return {
      format: 'json',
      data: '[]',
      count: 0,
      exportedAt: Date.now(),
    };
  }
}
