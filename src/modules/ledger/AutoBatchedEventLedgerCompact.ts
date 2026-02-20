import type { ContractFactory } from '../../core/ContractFactory.js';
import type { InvarianceEventEmitter } from '../../core/EventEmitter.js';
import type { Telemetry } from '../../core/Telemetry.js';
import { ErrorCode } from '@invariance/common';
import { InvarianceError } from '../../errors/InvarianceError.js';
import {
  toBytes32,
  fromBytes32,
  waitForReceipt,
  mapContractError,
  hashMetadata,
  mapSeverity,
  generateActorSignatureEIP712,
  generatePlatformAttestationEIP712,
} from '../../utils/contract-helpers.js';
import type {
  LedgerEventInput,
  LedgerEntry,
  AutoBatchConfig,
} from './types.js';

/** Compact on-chain LogInput struct */
interface CompactLogInput {
  actorIdentityId: `0x${string}`;
  actorAddress: string;
  action: string;
  category: string;
  metadataHash: `0x${string}`;
  proofHash: `0x${string}`;
  severity: number;
  nonce: bigint;
}

/** Buffered entry awaiting batch flush */
interface BufferedEntry {
  event: LedgerEventInput;
  compactInput: CompactLogInput;
  actorSig: `0x${string}`;
  platformSig: `0x${string}`;
  metadataHash: `0x${string}`;
  resolve: (entry: LedgerEntry) => void;
  reject: (err: Error) => void;
  addedAt: number;
}

/**
 * Auto-batching wrapper around CompactLedger that buffers `log()` calls
 * and flushes them as a single `logBatch()` transaction.
 *
 * @example
 * ```typescript
 * const batched = inv.ledgerCompactBatched({ maxBatchSize: 10, maxWaitMs: 5000 });
 * // These 10 calls produce 1 on-chain transaction:
 * await Promise.all(Array.from({ length: 10 }, (_, i) =>
 *   batched.log({ action: `action-${i}`, actor: { type: 'agent', address: '0x...' } })
 * ));
 * ```
 */
export class AutoBatchedEventLedgerCompact {
  private readonly contracts: ContractFactory;
  private readonly events: InvarianceEventEmitter;
  private readonly telemetry: Telemetry;
  private readonly maxBatchSize: number;
  private readonly maxWaitMs: number;
  private readonly enabled: boolean;

  private buffer: BufferedEntry[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private flushing = false;

  constructor(
    contracts: ContractFactory,
    events: InvarianceEventEmitter,
    telemetry: Telemetry,
    config?: AutoBatchConfig,
  ) {
    this.contracts = contracts;
    this.events = events;
    this.telemetry = telemetry;
    this.maxBatchSize = config?.maxBatchSize ?? 10;
    this.maxWaitMs = config?.maxWaitMs ?? 5000;
    this.enabled = config?.enabled ?? true;
  }

  /**
   * Log an event. If batching is enabled, the call is buffered and resolved
   * when the batch is flushed. If disabled, delegates directly to the single-entry path.
   */
  async log(event: LedgerEventInput): Promise<LedgerEntry> {
    if (this.destroyed) {
      throw new InvarianceError(ErrorCode.INVALID_INPUT, 'AutoBatchedEventLedgerCompact has been destroyed');
    }

    if (!this.enabled) {
      return this._logSingle(event);
    }

    // Prepare input + signatures eagerly so errors surface at call time
    const prepared = await this._prepare(event);

    return new Promise<LedgerEntry>((resolve, reject) => {
      this.buffer.push({ ...prepared, resolve, reject });

      if (this.buffer.length >= this.maxBatchSize) {
        this._scheduleFlush(0);
      } else if (!this.timer) {
        this._scheduleFlush(this.maxWaitMs);
      }
    });
  }

  /** Manually flush all buffered entries immediately */
  async flush(): Promise<void> {
    this._clearTimer();
    await this._flush();
  }

  /** Flush remaining buffer and prevent future calls */
  async destroy(): Promise<void> {
    this.destroyed = true;
    this._clearTimer();
    if (this.buffer.length > 0) {
      await this._flush();
    }
  }

  /** Get the current number of buffered entries */
  getBufferSize(): number {
    return this.buffer.length;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async _prepare(event: LedgerEventInput): Promise<Omit<BufferedEntry, 'resolve' | 'reject'>> {
    const identityContract = this.contracts.getContract('identity');
    const resolveFn = identityContract.read['resolve'];
    if (!resolveFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'resolve function not found');
    const identityId = await resolveFn([event.actor.address as `0x${string}`]) as `0x${string}`;

    const metadata = event.metadata ?? {};
    const metadataHash = hashMetadata(metadata);

    // Fetch on-chain nonce for the actor
    const compactLedger = this.contracts.getContract('compactLedger');
    const noncesFn = compactLedger.read['nonces'];
    const nonce = noncesFn
      ? await noncesFn([event.actor.address as `0x${string}`]) as bigint
      : 0n;

    const compactInput: CompactLogInput = {
      actorIdentityId: identityId,
      actorAddress: event.actor.address,
      action: event.action,
      category: event.category ?? 'custom',
      metadataHash,
      proofHash: metadataHash,
      severity: mapSeverity(event.severity ?? 'info'),
      nonce,
    };

    const domain = this.contracts.getCompactLedgerDomain();
    const walletClient = this.contracts.getWalletClient();

    const actorSig = await generateActorSignatureEIP712(compactInput, domain, walletClient);
    const platformSig = await generatePlatformAttestationEIP712(
      compactInput,
      this.contracts.getApiKey(),
      this.contracts.getApiBaseUrl(),
    );

    return { event, compactInput, actorSig, platformSig, metadataHash, addedAt: Date.now() };
  }

  private _scheduleFlush(delayMs: number): void {
    this._clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      this._flush().catch(() => {
        // Errors are already propagated to individual promise rejections
      });
    }, delayMs);
  }

  private _clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private async _flush(): Promise<void> {
    if (this.buffer.length === 0 || this.flushing) return;
    this.flushing = true;

    // Drain buffer
    const batch = this.buffer.splice(0);

    this.telemetry.track('ledgerCompact.logBatch', { count: batch.length });

    try {
      const compactLedger = this.contracts.getContract('compactLedger');

      const inputs = batch.map((b) => b.compactInput);
      const actorSigs = batch.map((b) => b.actorSig);
      const platformSigs = batch.map((b) => b.platformSig);

      const logBatchFn = compactLedger.write['logBatch'];
      if (!logBatchFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'logBatch function not found on CompactLedger');
      const txHash = await logBatchFn([inputs, actorSigs, platformSigs]);

      const optimistic = this.contracts.getConfirmation() === 'optimistic';
      const receiptClient = this.contracts.getReceiptClient();
      const receipt = await waitForReceipt(receiptClient, txHash, { optimistic });

      const explorerBase = this.contracts.getExplorerBaseUrl();

      for (let i = 0; i < batch.length; i++) {
        const b = batch[i]!;
        // For batches, derive a synthetic entryId from txHash + index
        const entryId = optimistic
          ? toBytes32(`${txHash}-${i}`)
          : toBytes32(`${receipt.txHash}-${i}`);

        const result: LedgerEntry = {
          entryId: fromBytes32(entryId),
          action: b.event.action,
          actor: b.event.actor,
          category: b.event.category ?? 'custom',
          txHash: receipt.txHash,
          blockNumber: receipt.blockNumber,
          timestamp: Date.now(),
          proof: {
            proofHash: b.metadataHash,
            signatures: {
              actor: b.actorSig,
              platform: b.platformSig,
              valid: true,
            },
            metadataHash: b.metadataHash,
            verifiable: true,
            raw: JSON.stringify({ entryId: fromBytes32(entryId), txHash: receipt.txHash, mode: 'compact-batch', batchIndex: i }),
          },
          metadataHash: b.metadataHash,
          ...(b.event.metadata !== undefined && { metadata: b.event.metadata }),
          explorerUrl: `${explorerBase}/tx/${receipt.txHash}`,
        };

        this.events.emit('ledger.logged', {
          entryId: result.entryId,
          action: b.event.action,
        });

        b.resolve(result);
      }
    } catch (err) {
      const mapped = mapContractError(err);
      for (const b of batch) {
        b.reject(mapped);
      }
    } finally {
      this.flushing = false;
    }
  }

  /** Bypass batching — direct single-entry log */
  private async _logSingle(event: LedgerEventInput): Promise<LedgerEntry> {
    const prepared = await this._prepare(event);
    const compactLedger = this.contracts.getContract('compactLedger');

    const logFn = compactLedger.write['log'];
    if (!logFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'log function not found on CompactLedger');
    const txHash = await logFn([prepared.compactInput, prepared.actorSig, prepared.platformSig]);

    const optimistic = this.contracts.getConfirmation() === 'optimistic';
    const receiptClient = this.contracts.getReceiptClient();
    const receipt = await waitForReceipt(receiptClient, txHash, { optimistic });

    const { parseCompactEntryIdFromLogs } = await import('../../utils/contract-helpers.js');
    const entryId = optimistic
      ? toBytes32(txHash)
      : parseCompactEntryIdFromLogs(receipt.logs);

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
        proofHash: prepared.metadataHash,
        signatures: {
          actor: prepared.actorSig,
          platform: prepared.platformSig,
          valid: true,
        },
        metadataHash: prepared.metadataHash,
        verifiable: true,
        raw: JSON.stringify({ entryId: fromBytes32(entryId), txHash: receipt.txHash, mode: 'compact' }),
      },
      metadataHash: prepared.metadataHash,
      ...(event.metadata !== undefined && { metadata: event.metadata }),
      explorerUrl: `${explorerBase}/tx/${receipt.txHash}`,
    };

    this.events.emit('ledger.logged', {
      entryId: result.entryId,
      action: event.action,
    });

    return result;
  }
}
