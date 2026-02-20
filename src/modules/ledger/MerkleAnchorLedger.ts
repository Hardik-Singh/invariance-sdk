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
  MerkleAnchorConfig,
} from './types.js';
import { buildAnchorTree, verifyAnchorLeafOffChain } from './merkle-anchor-builder.js';
import type { AnchorLeafValue } from './merkle-anchor-builder.js';

/** Compact on-chain LogInput struct (same as AutoBatched) */
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

/** Buffered entry awaiting merkle anchor flush */
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
 * Merkle-anchor batching ledger that buffers `log()` calls and flushes them
 * by anchoring a single merkle root on-chain (1 transaction per batch).
 *
 * Signatures are computed eagerly but kept off-chain. Only the merkle root
 * and leaf count are stored on-chain, yielding ~95% gas savings vs CompactLedger
 * for large batches.
 *
 * @example
 * ```typescript
 * const merkle = inv.ledgerMerkle({ maxBatchSize: 100, maxWaitMs: 10000 });
 * await Promise.all(events.map(e => merkle.log(e)));
 * await merkle.destroy();
 * ```
 */
export class MerkleAnchorLedger {
  private readonly contracts: ContractFactory;
  private readonly events: InvarianceEventEmitter;
  private readonly telemetry: Telemetry;
  private readonly maxBatchSize: number;
  private readonly maxWaitMs: number;

  private buffer: BufferedEntry[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private flushing = false;

  constructor(
    contracts: ContractFactory,
    events: InvarianceEventEmitter,
    telemetry: Telemetry,
    config?: MerkleAnchorConfig,
  ) {
    this.contracts = contracts;
    this.events = events;
    this.telemetry = telemetry;
    this.maxBatchSize = config?.maxBatchSize ?? 100;
    this.maxWaitMs = config?.maxWaitMs ?? 10000;
  }

  /**
   * Log an event. The call is buffered and resolved when the batch is flushed
   * as a merkle root anchor transaction.
   */
  async log(event: LedgerEventInput): Promise<LedgerEntry> {
    if (this.destroyed) {
      throw new InvarianceError(ErrorCode.INVALID_INPUT, 'MerkleAnchorLedger has been destroyed');
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

  /**
   * Verify a ledger entry off-chain using the merkle proof stored in proof.raw.
   *
   * @param entry - The ledger entry with merkle proof data in proof.raw
   * @returns Whether the proof is valid against the stored root
   */
  verifyEntry(entry: LedgerEntry): boolean {
    const raw = JSON.parse(entry.proof.raw);
    return verifyAnchorLeafOffChain(
      raw.root as string,
      raw.leafValue as AnchorLeafValue,
      raw.proof as string[],
    );
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

    this.telemetry.track('merkleAnchor.anchor', { count: batch.length });

    try {
      // Build leaf values from buffered entries
      const leafValues: AnchorLeafValue[] = batch.map((b, i) => [
        b.compactInput.actorIdentityId,
        b.compactInput.actorAddress,
        b.compactInput.action,
        b.compactInput.category,
        b.compactInput.metadataHash,
        b.compactInput.proofHash,
        b.compactInput.severity,
        BigInt(i),
      ]);

      // Build merkle tree
      const { root, proofs } = buildAnchorTree(leafValues);

      // Anchor merkle root on-chain (single tx)
      const merkleAnchor = this.contracts.getContract('merkleAnchor');
      const anchorFn = merkleAnchor.write['anchor'];
      if (!anchorFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'anchor function not found on MerkleAnchor');
      const txHash = await anchorFn([root as `0x${string}`, BigInt(batch.length)]);

      const optimistic = this.contracts.getConfirmation() === 'optimistic';
      const receiptClient = this.contracts.getReceiptClient();
      const receipt = await waitForReceipt(receiptClient, txHash, { optimistic });

      // Parse batchId from the Anchored event log
      let batchId = 0;
      if (!optimistic && receipt.logs.length > 0) {
        // batchId is the first indexed topic (after the event signature)
        const log = receipt.logs[0];
        if (log && log.topics && log.topics[1]) {
          batchId = Number(BigInt(log.topics[1]));
        }
      }

      const explorerBase = this.contracts.getExplorerBaseUrl();

      for (let i = 0; i < batch.length; i++) {
        const b = batch[i]!;
        const entryId = toBytes32(`${receipt.txHash}-merkle-${i}`);

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
            raw: JSON.stringify({
              batchId,
              root,
              leafValue: leafValues[i],
              proof: proofs[i],
              signatures: { actor: b.actorSig, platform: b.platformSig },
              mode: 'merkle-anchor',
              leafIndex: i,
            }),
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
}
