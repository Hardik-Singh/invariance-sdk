import type { ContractFactory } from '../../core/ContractFactory.js';
import type { InvarianceEventEmitter } from '../../core/EventEmitter.js';
import type { Telemetry } from '../../core/Telemetry.js';
import { ErrorCode } from '@invariance/common';
import type { Unsubscribe } from '@invariance/common';
import { InvarianceError } from '../../errors/InvarianceError.js';
import { IndexerClient } from '../../utils/indexer-client.js';
import {
  fromBytes32,
  waitForReceipt,
  mapContractError,
  parseEntryIdFromLogs,
  hashMetadata,
  mapSeverity,
  generateActorSignature,
  generatePlatformSignature,
  convertToCSV,
  actorTypeToEnum,
} from '../../utils/contract-helpers.js';
import type {
  LedgerEventInput,
  LedgerEntry,
  LedgerQueryFilters,
  ExportData,
  LedgerStreamCallback,
} from './types.js';

/** On-chain LogInput struct */
interface OnChainLogInput {
  actorIdentityId: `0x${string}`;
  actorType: number;
  actorAddress: string;
  action: string;
  category: string;
  metadataHash: `0x${string}`;
  proofHash: `0x${string}`;
  actorSignature: string;
  platformSignature: string;
  severity: number;
}

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
  private indexer: IndexerClient | null = null;

  constructor(
    contracts: ContractFactory,
    events: InvarianceEventEmitter,
    telemetry: Telemetry,
  ) {
    this.contracts = contracts;
    this.events = events;
    this.telemetry = telemetry;
  }

  /** Lazily initialize the indexer client */
  private getIndexer(): IndexerClient {
    if (!this.indexer) {
      this.indexer = new IndexerClient(this.contracts.getApiBaseUrl());
    }
    return this.indexer;
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

    try {
      const contract = this.contracts.getContract('ledger');
      const identityContract = this.contracts.getContract('identity');
      const publicClient = this.contracts.getPublicClient();

      // Resolve actor identity ID
      const resolveFn = identityContract.read['resolve'];
      if (!resolveFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'resolve function not found');
      const identityId = await resolveFn([event.actor.address as `0x${string}`]) as `0x${string}`;

      // Hash metadata
      const metadata = event.metadata ?? {};
      const metadataHash = hashMetadata(metadata);

      // Generate dual signatures
      const walletClient = this.contracts.getWalletClient();
      const actorSig = await generateActorSignature({ action: event.action, metadata }, walletClient);
      const platformSig = generatePlatformSignature({ action: event.action, metadata });

      // Prepare LogInput
      const logInput: OnChainLogInput = {
        actorIdentityId: identityId,
        actorType: actorTypeToEnum(event.actor.type),
        actorAddress: event.actor.address,
        action: event.action,
        category: event.category ?? 'custom',
        metadataHash,
        proofHash: metadataHash,
        actorSignature: actorSig,
        platformSignature: platformSig,
        severity: mapSeverity(event.severity ?? 'info'),
      };

      // Call contract
      const logFn = contract.write['log'];
      if (!logFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'log function not found');
      const txHash = await logFn([logInput]);

      const receipt = await waitForReceipt(publicClient, txHash);
      const entryId = parseEntryIdFromLogs(receipt.logs);

      const explorerBase = this.contracts.getExplorerBaseUrl();
      const result: LedgerEntry = {
        entryId: fromBytes32(entryId),
        action: event.action,
        actor: event.actor,
        category: event.category ?? 'custom',
        txHash: receipt.txHash,
        blockNumber: receipt.blockNumber,
        timestamp: Date.now(),
        proof: {
          proofHash: metadataHash,
          signatures: {
            actor: actorSig,
            platform: platformSig,
            valid: true,
          },
          metadataHash,
          verifiable: true,
          raw: JSON.stringify({ entryId: fromBytes32(entryId), txHash: receipt.txHash }),
        },
        metadataHash,
        ...(event.metadata !== undefined && { metadata: event.metadata }),
        explorerUrl: `${explorerBase}/tx/${receipt.txHash}`,
      };

      this.events.emit('ledger.logged', {
        entryId: result.entryId,
        action: event.action,
      });

      return result;
    } catch (err) {
      throw mapContractError(err);
    }
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

    try {
      const contract = this.contracts.getContract('ledger');
      const identityContract = this.contracts.getContract('identity');
      const publicClient = this.contracts.getPublicClient();

      // Prepare all log inputs
      const logInputs: OnChainLogInput[] = [];
      const walletClient = this.contracts.getWalletClient();

      for (const event of events) {
        const resolveFn = identityContract.read['resolve'];
        if (!resolveFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'resolve function not found');
        const identityId = await resolveFn([event.actor.address as `0x${string}`]) as `0x${string}`;

        const metadata = event.metadata ?? {};
        const metadataHash = hashMetadata(metadata);
        const actorSig = await generateActorSignature({ action: event.action, metadata }, walletClient);
        const platformSig = generatePlatformSignature({ action: event.action, metadata });

        logInputs.push({
          actorIdentityId: identityId,
          actorType: actorTypeToEnum(event.actor.type),
          actorAddress: event.actor.address,
          action: event.action,
          category: event.category ?? 'custom',
          metadataHash,
          proofHash: metadataHash,
          actorSignature: actorSig,
          platformSignature: platformSig,
          severity: mapSeverity(event.severity ?? 'info'),
        });
      }

      // Submit batch
      const logBatchFn = contract.write['logBatch'];
      if (!logBatchFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'logBatch function not found');
      const txHash = await logBatchFn([logInputs]);

      const receipt = await waitForReceipt(publicClient, txHash);

      // Parse real entry IDs from contract logs (BatchLogged/EntryLogged events)
      const parsedEntryIds: string[] = [];
      for (const log of receipt.logs) {
        if (log.topics[1]) {
          parsedEntryIds.push(fromBytes32(log.topics[1] as `0x${string}`));
        }
      }

      const explorerBase = this.contracts.getExplorerBaseUrl();
      const results: LedgerEntry[] = events.map((event, i) => {
        const baseEntry: LedgerEntry = {
          entryId: parsedEntryIds[i] ?? `batch_${i}_${Date.now()}`,
          action: event.action,
          actor: event.actor,
          category: event.category ?? 'custom',
          txHash: receipt.txHash,
          blockNumber: receipt.blockNumber,
          timestamp: Date.now(),
          proof: {
            proofHash: logInputs[i]!.metadataHash,
            signatures: {
              actor: logInputs[i]!.actorSignature,
              platform: logInputs[i]!.platformSignature,
              valid: true,
            },
            metadataHash: logInputs[i]!.metadataHash,
            verifiable: true,
            raw: JSON.stringify({ txHash: receipt.txHash }),
          },
          metadataHash: logInputs[i]!.metadataHash,
          explorerUrl: `${explorerBase}/tx/${receipt.txHash}`,
        };
        if (event.metadata !== undefined) {
          return { ...baseEntry, metadata: event.metadata };
        }
        return baseEntry;
      });

      return results;
    } catch (err) {
      throw mapContractError(err);
    }
  }

  /**
   * Query ledger entries by identity, action, or time range.
   *
   * @param filters - Query filters (actor, action, category, time range)
   * @returns Array of matching ledger entries
   */
  async query(filters: LedgerQueryFilters): Promise<LedgerEntry[]> {
    this.telemetry.track('ledger.query', { hasFilters: true });

    try {
      const indexer = this.getIndexer();
      const available = await indexer.isAvailable();

      if (!available) {
        return [];
      }

      const params: Record<string, string | number | undefined> = {
        actor: filters.actor,
        actorType: filters.actorType,
        action: Array.isArray(filters.action) ? filters.action.join(',') : filters.action,
        category: filters.category,
        from: typeof filters.from === 'string' ? filters.from : filters.from?.toString(),
        to: typeof filters.to === 'string' ? filters.to : filters.to?.toString(),
        limit: filters.limit ?? 100,
        offset: filters.offset ?? 0,
        orderBy: filters.orderBy ?? 'timestamp',
        order: filters.order ?? 'desc',
      };

      const data = await indexer.get<LedgerEntry[]>('/ledger/entries', params);
      return data;
    } catch {
      return [];
    }
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
  stream(filters: LedgerQueryFilters, callback: LedgerStreamCallback): Unsubscribe {
    this.telemetry.track('ledger.stream');

    try {
      const contract = this.contracts.getContract('ledger');
      const publicClient = this.contracts.getPublicClient();

      // Subscribe to EntryLogged events
      const unwatch = publicClient.watchContractEvent({
        address: contract.address as `0x${string}`,
        abi: contract.abi,
        eventName: 'EntryLogged',
        onLogs: (logs) => {
          for (const log of logs) {
            // Filter based on criteria and call callback
            const args = (log as { args?: { action?: string; actorAddress?: string } }).args;
            if (!args) continue;

            if (filters.action && args.action !== filters.action) continue;
            if (filters.actor && args.actorAddress !== filters.actor) continue;

            // Construct minimal entry for callback
            const entry: LedgerEntry = {
              entryId: log.topics[1] as string ?? '',
              action: args.action ?? '',
              actor: { type: 'agent', address: args.actorAddress ?? '' },
              category: 'custom',
              txHash: log.transactionHash ?? '',
              blockNumber: Number(log.blockNumber ?? 0),
              timestamp: Date.now(),
              proof: {
                proofHash: '',
                signatures: { actor: '', valid: true },
                metadataHash: '',
                verifiable: true,
                raw: '',
              },
              metadataHash: '',
              explorerUrl: '',
            };

            callback(entry);
          }
        },
      });

      return unwatch;
    } catch (err) {
      this.telemetry.track('ledger.stream.error', { error: String(err) });
      return () => {
        // No-op
      };
    }
  }

  /**
   * Export ledger entries as JSON or CSV.
   *
   * @param filters - Query filters to select entries for export
   * @returns Exported data in the requested format
   */
  async export(filters: LedgerQueryFilters): Promise<ExportData> {
    this.telemetry.track('ledger.export');

    try {
      const entries = await this.query({ ...filters, limit: 10000 });
      const format = (filters as { format?: 'json' | 'csv' }).format ?? 'json';

      if (format === 'csv') {
        const csvData = convertToCSV(entries);
        return {
          format: 'csv',
          data: csvData,
          count: entries.length,
          exportedAt: Date.now(),
        };
      }

      return {
        format: 'json',
        data: JSON.stringify(entries, null, 2),
        count: entries.length,
        exportedAt: Date.now(),
      };
    } catch {
      return {
        format: 'json',
        data: '[]',
        count: 0,
        exportedAt: Date.now(),
      };
    }
  }
}
