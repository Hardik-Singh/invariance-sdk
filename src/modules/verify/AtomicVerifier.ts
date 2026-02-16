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
  parseAtomicEntryIdFromLogs,
  hashMetadata,
  mapSeverity,
  generateActorSignatureEIP712,
  generatePlatformAttestationEIP712,
} from '../../utils/contract-helpers.js';
import type { LedgerEventInput, LedgerEntry } from '../ledger/types.js';

/**
 * Single-transaction atomic verifier: identity check + policy eval + compact ledger log.
 *
 * Wraps `AtomicVerifier.verifyAndLog()` with the same EIP-712 signing flow
 * as {@link EventLedgerCompact}. Requires an API key for platform attestation.
 *
 * @example
 * ```typescript
 * const entry = await inv.atomic.verifyAndLog({
 *   action: 'swap',
 *   actor: { type: 'agent', address: '0xBot' },
 *   metadata: { from: 'USDC', to: 'ETH', amount: '100' },
 * });
 * ```
 */
export class AtomicVerifier {
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

  /** Get the contract address for the atomic verifier */
  getContractAddress(): string {
    return this.contracts.getAddress('atomicVerifier');
  }

  /**
   * Verify identity + evaluate policy + log to CompactLedger in a single transaction.
   *
   * @param event - The event to verify and log
   * @returns The created ledger entry with proof bundle
   * @throws {InvarianceError} If no API key is configured
   */
  async verifyAndLog(event: LedgerEventInput): Promise<LedgerEntry> {
    this.telemetry.track('atomic.verifyAndLog', {
      action: event.action,
      category: event.category ?? 'custom',
    });

    try {
      const atomicVerifier = this.contracts.getContract('atomicVerifier');
      const identityContract = this.contracts.getContract('identity');

      // Resolve actor identity ID
      const resolveFn = identityContract.read['resolve'];
      if (!resolveFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'resolve function not found');
      const identityId = await resolveFn([event.actor.address as `0x${string}`]) as `0x${string}`;

      // Hash metadata
      const metadata = event.metadata ?? {};
      const metadataHash = hashMetadata(metadata);

      // Build compact input struct
      const compactInput = {
        actorIdentityId: identityId,
        actorAddress: event.actor.address,
        action: event.action,
        category: event.category ?? 'custom',
        metadataHash,
        proofHash: metadataHash,
        severity: mapSeverity(event.severity ?? 'info'),
      };

      // Generate EIP-712 dual signatures
      const domain = this.contracts.getCompactLedgerDomain();
      const walletClient = this.contracts.getWalletClient();

      const actorSig = await generateActorSignatureEIP712(compactInput, domain, walletClient);
      const platformSig = await generatePlatformAttestationEIP712(
        compactInput,
        this.contracts.getApiKey(),
        this.contracts.getApiBaseUrl(),
      );

      // Single tx: verifyAndLog
      const verifyAndLogFn = atomicVerifier.write['verifyAndLog'];
      if (!verifyAndLogFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'verifyAndLog function not found on AtomicVerifier');
      const txHash = await verifyAndLogFn([compactInput, actorSig, platformSig]);

      const optimistic = this.contracts.getConfirmation() === 'optimistic';
      const receiptClient = this.contracts.getReceiptClient();
      const receipt = await waitForReceipt(receiptClient, txHash, { optimistic });
      const entryId = optimistic
        ? toBytes32(txHash)
        : parseAtomicEntryIdFromLogs(receipt.logs);

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
          raw: JSON.stringify({ entryId: fromBytes32(entryId), txHash: receipt.txHash, mode: 'atomic' }),
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
}
