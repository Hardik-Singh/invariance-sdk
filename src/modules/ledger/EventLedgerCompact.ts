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
  parseCompactEntryIdFromLogs,
  hashMetadata,
  mapSeverity,
  generateActorSignatureEIP712,
  generatePlatformAttestationEIP712,
} from '../../utils/contract-helpers.js';
import type {
  LedgerEventInput,
  LedgerEntry,
} from './types.js';

/** Compact on-chain LogInput struct (no actorType, no signatures in struct) */
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

/**
 * Fraud-proof on-chain logging via CompactLedger with EIP-712 dual signatures.
 *
 * Unlike the legacy {@link EventLedger}, this module calls `CompactLedger.log(input, actorSig, platformSig)`
 * where both signatures are verified on-chain via `ECDSA.recover`. This means:
 * - Actor signature uses EIP-712 `signTypedData` (not `signMessage`)
 * - Platform signature comes from `/v1/attest` API (API key required)
 * - The keccak256 fallback is NOT valid — it will revert on-chain
 *
 * @example
 * ```typescript
 * // Requires API key for platform attestation
 * const inv = new Invariance({
 *   chain: 'base-sepolia',
 *   signer: wallet,
 *   apiKey: 'inv_live_xxx',
 * });
 *
 * const entry = await inv.ledgerCompact.log({
 *   action: 'model-inference',
 *   actor: { type: 'agent', address: '0xMyAgent' },
 *   metadata: { model: 'claude-sonnet', latencyMs: 230 },
 * });
 * ```
 */
export class EventLedgerCompact {
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

  /** Get the contract address for the compact ledger module */
  getContractAddress(): string {
    return this.contracts.getAddress('compactLedger');
  }

  /**
   * Log a fraud-proof event on-chain via CompactLedger.
   *
   * Creates an immutable ledger entry with EIP-712 dual signatures (actor + platform)
   * that are verified on-chain. Requires an API key for platform attestation.
   *
   * @param event - The event to log
   * @returns The created ledger entry with proof bundle
   * @throws {InvarianceError} If no API key is configured
   */
  async log(event: LedgerEventInput): Promise<LedgerEntry> {
    this.telemetry.track('ledgerCompact.log', {
      action: event.action,
      category: event.category ?? 'custom',
    });

    try {
      const compactLedger = this.contracts.getContract('compactLedger');
      const identityContract = this.contracts.getContract('identity');

      // Resolve actor identity ID
      const resolveFn = identityContract.read['resolve'];
      if (!resolveFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'resolve function not found');
      const identityId = await resolveFn([event.actor.address as `0x${string}`]) as `0x${string}`;

      // Hash metadata
      const metadata = event.metadata ?? {};
      const metadataHash = hashMetadata(metadata);

      // Fetch on-chain nonce for the actor
      const noncesFn = compactLedger.read['nonces'];
      const nonce = noncesFn
        ? await noncesFn([event.actor.address as `0x${string}`]) as bigint
        : 0n;

      // Build compact input struct
      const compactInput: CompactLogInput = {
        actorIdentityId: identityId,
        actorAddress: event.actor.address,
        action: event.action,
        category: event.category ?? 'custom',
        metadataHash,
        /** @todo V2: generate a distinct proof hash (e.g. hash of code version + previous state) */
        proofHash: metadataHash,
        severity: mapSeverity(event.severity ?? 'info'),
        nonce,
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

      // Call CompactLedger.log(input, actorSig, platformSig)
      const logFn = compactLedger.write['log'];
      if (!logFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'log function not found on CompactLedger');
      const txHash = await logFn([compactInput, actorSig, platformSig]);

      const optimistic = this.contracts.getConfirmation() === 'optimistic';
      const receiptClient = this.contracts.getReceiptClient();
      const receipt = await waitForReceipt(receiptClient, txHash, { optimistic });
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
          proofHash: metadataHash,
          signatures: {
            actor: actorSig,
            platform: platformSig,
            valid: true,
          },
          metadataHash,
          verifiable: true,
          raw: JSON.stringify({ entryId: fromBytes32(entryId), txHash: receipt.txHash, mode: 'compact' }),
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
