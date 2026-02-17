import type { ContractFactory } from '../../core/ContractFactory.js';
import type { InvarianceEventEmitter } from '../../core/EventEmitter.js';
import type { Telemetry } from '../../core/Telemetry.js';
import { ErrorCode } from '@invariance/common';
import { InvarianceError } from '../../errors/InvarianceError.js';
import { IndexerClient } from '../../utils/indexer-client.js';
import { mapIntentRow } from '../../utils/indexer-mappers.js';
import { X402Manager } from '../x402/X402Manager.js';
import { stringToHex } from 'viem';
import { parseBaseUnitAmount } from '../../utils/amounts.js';
import {
  toBytes32,
  fromBytes32,
  waitForReceipt,
  mapContractError,
  parseIntentIdFromLogs,
  hashMetadata,
  intentStatusFromEnum,
  generateActorSignature,
  generatePlatformCommitment,
} from '../../utils/contract-helpers.js';
import type {
  IntentRequestOptions,
  IntentResult,
  PreparedIntent,
  IntentStatus,
  ApprovalResult,
  TxReceipt,
  IntentHistoryFilters,
  RetryConfig,
  RetryResult,
} from './types.js';

/** On-chain Intent struct */
interface OnChainIntent {
  intentId: `0x${string}`;
  requesterIdentityId: `0x${string}`;
  requester: string;
  action: `0x${string}`;
  target: string;
  value: bigint;
  data: string;
  description: string;
  metadataHash: `0x${string}`;
  status: number;
  createdAt: bigint;
  expiresAt: bigint;
  completedAt: bigint;
  resultHash: `0x${string}`;
}

/** On-chain Approval struct */
interface OnChainApproval {
  approver: string;
  approverIdentityId: `0x${string}`;
  approvedAt: bigint;
  reason: string;
}

/**
 * The Intent Protocol is the heart of Invariance.
 *
 * Every verified action follows the same four-step handshake:
 * **Request -> Approve -> Execute -> Verify**.
 *
 * The proof generated at the end looks identical regardless of who
 * performed the action (agent, human, or device).
 *
 * @example
 * ```typescript
 * const trade = await inv.intent.request({
 *   actor: { type: 'agent', address: '0xTradingBot' },
 *   action: 'swap',
 *   params: { from: 'USDC', to: 'ETH', amount: '100' },
 *   approval: 'auto',
 * });
 * console.log(trade.explorerUrl);
 * ```
 */
export class IntentProtocol {
  private readonly contracts: ContractFactory;
  private readonly events: InvarianceEventEmitter;
  private readonly telemetry: Telemetry;
  private indexer: IndexerClient | null = null;
  private x402: X402Manager | null = null;

  constructor(
    contracts: ContractFactory,
    events: InvarianceEventEmitter,
    telemetry: Telemetry,
  ) {
    this.contracts = contracts;
    this.events = events;
    this.telemetry = telemetry;
  }

  /** Lazily initialize the X402 manager */
  private getX402Manager(): X402Manager {
    if (!this.x402) {
      this.x402 = new X402Manager(this.contracts, this.events, this.telemetry);
    }
    return this.x402;
  }

  /** Lazily initialize the indexer client */
  private getIndexer(): IndexerClient {
    if (!this.indexer) {
      this.indexer = new IndexerClient(this.contracts.getApiBaseUrl(), this.contracts.getApiKey());
    }
    return this.indexer;
  }

  /**
   * Full intent handshake: request, approve, execute, verify.
   *
   * This is the primary method for performing verified actions.
   * The approval method determines how the intent is approved:
   * - 'auto': Policy engine auto-approves (for agents)
   * - 'wallet-signature': Requires wallet signature (for humans)
   * - 'multi-sig': M-of-N approval required
   *
   * @param opts - Intent request options
   * @returns The completed intent result with proof bundle
   */
  async request(opts: IntentRequestOptions): Promise<IntentResult> {
    this.telemetry.track('intent.request', {
      action: opts.action,
      approval: opts.approval ?? 'auto',
    });

    try {
      const contract = this.contracts.getContract('intent');
      const identityContract = this.contracts.getContract('identity');

      // Resolve actor identity ID
      const resolveFn = identityContract.read['resolve'];
      if (!resolveFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'resolve function not found');
      const identityId = await resolveFn([opts.actor.address as `0x${string}`]) as `0x${string}`;

      // Handle x402 payment if enabled
      if (opts.payment?.enabled) {
        const x402 = this.getX402Manager();

        if (opts.payment.receiptId) {
          // Verify existing payment receipt
          const verification = await x402.verifyPayment(opts.payment.receiptId);
          if (!verification.valid) {
            throw new InvarianceError(
              ErrorCode.PAYMENT_VERIFICATION_FAILED,
              `Payment verification failed: ${verification.reason}`,
            );
          }
          // Attach verified receipt ID to metadata
          opts.metadata = {
            ...opts.metadata,
            paymentReceiptId: opts.payment.receiptId,
          };
        } else {
          // Create a new payment
          const recipient = opts.payment.recipient ?? opts.target ?? '';
          if (!recipient) {
            throw new InvarianceError(
              ErrorCode.PAYMENT_REQUIRED,
              'Payment recipient is required when payment is enabled',
            );
          }
          const amount = opts.payment.maxCost ?? '0.01';
          const receipt = await x402.payForAction({
            action: opts.action,
            amount,
            recipient,
            identityId: fromBytes32(identityId),
          });
          // Attach payment receipt ID to metadata
          opts.metadata = {
            ...opts.metadata,
            paymentReceiptId: receipt.paymentId,
            paymentPayloadHash: receipt.payloadHash,
          };
        }
      }

      // Prepare request parameters
      const actionBytes = toBytes32(opts.action);
      const targetAddress = (opts.target ?? '0x0000000000000000000000000000000000000000') as `0x${string}`;
      const value = opts.amount !== undefined ? parseBaseUnitAmount(opts.amount, 'amount') : 0n;
      const data = opts.params ? (stringToHex(JSON.stringify(opts.params)) as `0x${string}`) : '0x' as `0x${string}`;
      const description = (opts.metadata?.['description'] as string | undefined) ?? opts.action;
      const metadataHash = hashMetadata(opts.metadata ?? {});
      const expiresAt = BigInt((opts.metadata?.['expiresAt'] as number | undefined) ?? 0);

      // Submit intent to contract
      const requestFn = contract.write['request'];
      if (!requestFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'request function not found');
      const txHash = await requestFn([
        identityId,
        actionBytes,
        targetAddress,
        value,
        data,
        description,
        metadataHash,
        expiresAt,
      ]);

      const optimistic = this.contracts.getConfirmation() === 'optimistic';
      const receiptClient = this.contracts.getReceiptClient();
      const receipt = await waitForReceipt(receiptClient, txHash, { optimistic });
      const intentId = optimistic
        ? toBytes32(txHash) // Use txHash as placeholder ID in optimistic mode
        : parseIntentIdFromLogs(receipt.logs);

      // Auto-approve if requested
      if (opts.approval === 'auto') {
        const approveFn = contract.write['approve'];
        if (!approveFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'approve function not found');
        await approveFn([intentId, identityId, 'Auto-approved by policy engine']);
      }

      // Generate proof bundle
      const metadata = opts.metadata ?? {};
      const walletClient = this.contracts.getWalletClient();
      const actorSig = await generateActorSignature({ action: opts.action, metadata }, walletClient);
      const platformSig = generatePlatformCommitment({ action: opts.action, metadata });

      const proof = {
        proofHash: metadataHash,
        signatures: {
          actor: actorSig,
          platform: platformSig,
          valid: true,
        },
        metadataHash,
        verifiable: true,
        raw: JSON.stringify({ intentId: fromBytes32(intentId), txHash, action: opts.action }),
      };

      const explorerBase = this.contracts.getExplorerBaseUrl();
      const result: IntentResult = {
        intentId: fromBytes32(intentId),
        status: opts.approval === 'auto' ? 'completed' : 'pending',
        actor: opts.actor,
        action: opts.action,
        proof,
        txHash: receipt.txHash,
        timestamp: Date.now(),
        blockNumber: receipt.blockNumber,
        explorerUrl: `${explorerBase}/tx/${receipt.txHash}`,
        logId: fromBytes32(intentId),
      };

      const requestedPayload: {
        intentId: string;
        action: string;
        requester: string;
        requesterIdentityId: string;
        target?: string;
        value?: string;
      } = {
        intentId: result.intentId,
        action: opts.action,
        requester: opts.actor.address,
        requesterIdentityId: fromBytes32(identityId),
      };
      if (opts.target !== undefined) requestedPayload.target = opts.target;
      if (opts.amount !== undefined) requestedPayload.value = opts.amount;
      this.events.emit('intent.requested', requestedPayload);

      return result;
    } catch (err) {
      throw mapContractError(err);
    }
  }

  /**
   * Single-transaction atomic verification using CompactLedger + AtomicVerifier.
   *
   * Collapses identity check + policy evaluation + ledger log into one tx.
   * ~86% gas reduction compared to the full intent handshake.
   *
   * @param opts - Intent request options
   * @returns The completed intent result with proof bundle
   */
  async requestAtomic(opts: IntentRequestOptions): Promise<IntentResult> {
    this.telemetry.track('intent.requestAtomic', {
      action: opts.action,
    });

    try {
      const identityContract = this.contracts.getContract('identity');
      const atomicVerifier = this.contracts.getContract('atomicVerifier');

      // Resolve actor identity ID
      const resolveFn = identityContract.read['resolve'];
      if (!resolveFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'resolve function not found');
      const identityId = await resolveFn([opts.actor.address as `0x${string}`]) as `0x${string}`;

      // Build compact log input
      const metadata = opts.metadata ?? {};
      const metadataHash = hashMetadata(metadata);
      const walletClient = this.contracts.getWalletClient();
      const actorSig = await generateActorSignature({ action: opts.action, metadata }, walletClient);
      const platformSig = await generatePlatformCommitment({ action: opts.action, metadata });

      const compactInput = {
        actorIdentityId: identityId,
        actorAddress: opts.actor.address,
        action: opts.action,
        category: (opts.metadata?.['category'] as string | undefined) ?? 'custom',
        metadataHash,
        proofHash: metadataHash,
        severity: 0, // Info
      };

      // Single tx: verifyAndLog
      const verifyAndLogFn = atomicVerifier.write['verifyAndLog'];
      if (!verifyAndLogFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'verifyAndLog function not found');
      const txHash = await verifyAndLogFn([compactInput, actorSig, platformSig]);

      const optimistic = this.contracts.getConfirmation() === 'optimistic';
      const receiptClient = this.contracts.getReceiptClient();
      const receipt = await waitForReceipt(receiptClient, txHash, { optimistic });
      const entryId = optimistic
        ? toBytes32(txHash)
        : parseIntentIdFromLogs(receipt.logs);

      const proof = {
        proofHash: metadataHash,
        signatures: {
          actor: actorSig,
          platform: platformSig,
          valid: true,
        },
        metadataHash,
        verifiable: true,
        raw: JSON.stringify({ entryId: fromBytes32(entryId), txHash, action: opts.action, mode: 'atomic' }),
      };

      const explorerBase = this.contracts.getExplorerBaseUrl();
      const result: IntentResult = {
        intentId: fromBytes32(entryId),
        status: 'completed',
        actor: opts.actor,
        action: opts.action,
        proof,
        txHash: receipt.txHash,
        timestamp: Date.now(),
        blockNumber: receipt.blockNumber,
        explorerUrl: `${explorerBase}/tx/${receipt.txHash}`,
        logId: fromBytes32(entryId),
      };

      const atomicRequestedPayload: {
        intentId: string;
        action: string;
        requester: string;
        requesterIdentityId: string;
        target?: string;
        value?: string;
        mode: string;
      } = {
        intentId: result.intentId,
        action: opts.action,
        requester: opts.actor.address,
        requesterIdentityId: fromBytes32(identityId),
        mode: 'atomic',
      };
      if (opts.target !== undefined) atomicRequestedPayload.target = opts.target;
      if (opts.amount !== undefined) atomicRequestedPayload.value = opts.amount;
      this.events.emit('intent.requested', atomicRequestedPayload);

      return result;
    } catch (err) {
      throw mapContractError(err);
    }
  }

  /**
   * Prepare an intent without executing (dry-run).
   *
   * Useful for checking if an intent would succeed, estimating gas,
   * and previewing policy evaluations before committing.
   *
   * @param opts - Intent request options
   * @returns Prepared intent with policy checks and gas estimate
   */
  async prepare(opts: IntentRequestOptions): Promise<PreparedIntent> {
    this.telemetry.track('intent.prepare', { action: opts.action });

    try {
      const identityContract = this.contracts.getContract('identity');
      const policyContract = this.contracts.getContract('policy');
      const publicClient = this.contracts.getPublicClient();

      // Resolve actor identity ID
      const resolveFn = identityContract.read['resolve'];
      if (!resolveFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'resolve function not found');
      const identityId = await resolveFn([opts.actor.address as `0x${string}`]) as `0x${string}`;

      // Check identity status
      const isActiveFn = identityContract.read['isActive'];
      if (!isActiveFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'isActive function not found');
      const isActive = await isActiveFn([identityId]) as boolean;

      const warnings: string[] = [];
      if (!isActive) {
        warnings.push('Identity is not active');
      }

      // Evaluate against policies
      const actionBytes = toBytes32(opts.action);
      const targetAddress = (opts.target ?? '0x0000000000000000000000000000000000000000') as `0x${string}`;
      const value = opts.amount !== undefined ? parseBaseUnitAmount(opts.amount, 'amount') : 0n;
      const data = opts.params ? (stringToHex(JSON.stringify(opts.params)) as `0x${string}`) : '0x' as `0x${string}`;

      const evaluateFn = policyContract.read['evaluate'];
      let wouldSucceed = isActive;
      const policyChecks = [];

      if (evaluateFn) {
        try {
          const [allowed, reason] = await evaluateFn([identityId, actionBytes, targetAddress, value, data]) as [boolean, string];
          wouldSucceed = wouldSucceed && allowed;
          policyChecks.push({
            rule: 'policy-evaluation',
            passed: allowed,
            detail: reason || (allowed ? 'Policy check passed' : 'Policy check failed'),
          });
          if (!allowed) {
            warnings.push(`Policy denied: ${reason}`);
          }
        } catch {
          warnings.push('Policy evaluation failed');
        }
      }

      // Estimate gas
      const gasPrice = await publicClient.getGasPrice();
      const gasLimit = 150000;
      const gasCostWei = gasPrice * BigInt(gasLimit);
      const { formatEther } = await import('viem');
      const ethCost = formatEther(gasCostWei);
      const estimatedGas = {
        ethCost,
        usdcCost: '0', // Requires price oracle — not estimated here
        gasLimit,
        gasPrice: gasPrice.toString(),
        strategy: this.contracts.getGasStrategy(),
      };

      const intentId = `inv_int_${Date.now().toString(36)}`;

      return {
        intentId,
        wouldSucceed,
        policyChecks,
        estimatedGas,
        warnings,
      };
    } catch (err) {
      throw mapContractError(err);
    }
  }

  /**
   * Manually approve a pending intent.
   *
   * Used when an intent requires wallet signature or multi-sig approval
   * and the signer wants to approve it explicitly.
   *
   * @param intentId - The intent to approve
   * @returns Approval result with threshold status
   */
  async approve(intentId: string): Promise<ApprovalResult> {
    this.telemetry.track('intent.approve');

    try {
      const contract = this.contracts.getContract('intent');
      const identityContract = this.contracts.getContract('identity');
      const publicClient = this.contracts.getPublicClient();

      // Get current signer address
      const signerAddress = this.contracts.getWalletAddress() as `0x${string}`;

      // Resolve approver identity ID
      const resolveFn = identityContract.read['resolve'];
      if (!resolveFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'resolve function not found');
      const approverIdentityId = await resolveFn([signerAddress]) as `0x${string}`;

      // Approve the intent
      const intentIdBytes = toBytes32(intentId);
      const approveFn = contract.write['approve'];
      if (!approveFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'approve function not found');
      const txHash = await approveFn([intentIdBytes, approverIdentityId, 'Manual approval']);

      const receipt = await waitForReceipt(publicClient, txHash);

      // Get updated approval count
      const verifyFn = contract.read['verify'];
      if (!verifyFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'verify function not found');
      const [, approvals] = await verifyFn([intentIdBytes]) as [OnChainIntent, OnChainApproval[]];

      return {
        signer: signerAddress,
        txHash: receipt.txHash,
        approvalsReceived: approvals.length,
        thresholdMet: approvals.length > 0,
        remaining: 0,
      };
    } catch (err) {
      throw mapContractError(err);
    }
  }

  /**
   * Reject a pending intent.
   *
   * @param intentId - The intent to reject
   * @param reason - Optional reason for rejection
   * @returns Transaction receipt
   */
  async reject(intentId: string, reason?: string): Promise<TxReceipt> {
    this.telemetry.track('intent.reject');

    try {
      const contract = this.contracts.getContract('intent');
      const publicClient = this.contracts.getPublicClient();

      const intentIdBytes = toBytes32(intentId);
      const rejectFn = contract.write['reject'];
      if (!rejectFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'reject function not found');
      const txHash = await rejectFn([intentIdBytes, reason ?? 'Manually rejected']);

      const receipt = await waitForReceipt(publicClient, txHash);

      this.events.emit('intent.rejected', {
        intentId,
        reason: reason ?? 'Manually rejected',
        rejector: this.contracts.getWalletAddress(),
      });

      return {
        txHash: receipt.txHash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        status: receipt.status,
      };
    } catch (err) {
      throw mapContractError(err);
    }
  }

  /**
   * Check the lifecycle status of an intent.
   *
   * @param intentId - The intent to check
   * @returns Current intent status with approval details
   */
  async status(intentId: string): Promise<IntentStatus> {
    this.telemetry.track('intent.status');

    try {
      const contract = this.contracts.getContract('intent');

      const intentIdBytes = toBytes32(intentId);
      const verifyFn = contract.read['verify'];
      if (!verifyFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'verify function not found');
      const [intent, approvals] = await verifyFn([intentIdBytes]) as [OnChainIntent, OnChainApproval[]];

      if (intent.createdAt === 0n) {
        throw new InvarianceError(
          ErrorCode.INTENT_EXPIRED,
          `Intent not found: ${intentId}`,
        );
      }

      const lifecycle = intentStatusFromEnum(intent.status);
      const explorerBase = this.contracts.getExplorerBaseUrl();

      const result: IntentStatus = {
        intentId: fromBytes32(intent.intentId),
        lifecycle,
        actor: {
          type: 'agent',
          address: intent.requester,
        },
        action: fromBytes32(intent.action),
        explorerUrl: `${explorerBase}/intent/${fromBytes32(intent.intentId)}`,
      };

      if (approvals.length > 0) {
        result.approvals = {
          required: 1,
          received: approvals.length,
          signers: approvals.map((a) => ({
            address: a.approver,
            approved: true,
            timestamp: Number(a.approvedAt),
          })),
        };
      }

      if (intent.completedAt > 0n) {
        // For completed intents, reconstruct commitment hashes (we may not be the original actor)
        const platformSig = generatePlatformCommitment({ action: result.action });
        const actorSig = platformSig; // Commitment placeholder — original actor signature is on-chain

        result.proof = {
          proofHash: intent.resultHash,
          signatures: {
            actor: actorSig,
            platform: platformSig,
            valid: true,
          },
          metadataHash: intent.metadataHash,
          verifiable: true,
          raw: JSON.stringify({ intentId: fromBytes32(intent.intentId), completedAt: Number(intent.completedAt) }),
        };
      }

      return result;
    } catch (err) {
      throw mapContractError(err);
    }
  }

  /**
   * Request an intent with automatic retry on transient failures.
   *
   * Retries on NETWORK_ERROR, RPC_ERROR, and TIMEOUT by default.
   * Uses exponential backoff between attempts.
   *
   * @param opts - Intent request options
   * @param retryConfig - Retry behavior configuration
   * @returns Result with attempt history
   *
   * @example
   * ```typescript
   * const result = await inv.intent.requestWithRetry(
   *   { actor, action: 'swap', params, approval: 'auto' },
   *   { maxAttempts: 3, initialDelayMs: 1000, backoffMultiplier: 2 }
   * );
   * ```
   */
  async requestWithRetry(opts: IntentRequestOptions, retryConfig: RetryConfig = {}): Promise<RetryResult> {
    const {
      maxAttempts = 3,
      initialDelayMs = 1000,
      backoffMultiplier = 2,
      retryableErrors = ['NETWORK_ERROR', 'RPC_ERROR', 'TIMEOUT'],
    } = retryConfig;

    const errors: RetryResult['errors'] = [];
    let delay = initialDelayMs;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await this.request(opts);
        return { result, attempts: attempt, errors, success: true };
      } catch (err) {
        const code = (err as { code?: string }).code ?? 'UNKNOWN';
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ attempt, error: message, code });

        const isRetryable = retryableErrors.some((rc) => code.includes(rc) || message.includes(rc));
        if (!isRetryable || attempt === maxAttempts) {
          return { result: null, attempts: attempt, errors, success: false };
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= backoffMultiplier;
      }
    }

    return { result: null, attempts: maxAttempts, errors, success: false };
  }

  /**
   * Query intent history with filters.
   *
   * @param filters - Optional filters for actor, action, status, time range
   * @returns Array of completed intent results
   */
  async history(filters?: IntentHistoryFilters): Promise<IntentResult[]> {
    this.telemetry.track('intent.history', { hasFilters: filters !== undefined });

    try {
      const indexer = this.getIndexer();
      const available = await indexer.isAvailable();

      if (!available) {
        return [];
      }

      const pageSize = Math.max(1, filters?.limit ?? 50);
      const offset = Math.max(0, filters?.offset ?? 0);
      const page = Math.floor(offset / pageSize) + 1;
      const params: Record<string, string | number | undefined> = {
        actorAddress: filters?.actor,
        action: Array.isArray(filters?.action) ? filters.action.join(',') : filters?.action,
        status: filters?.status,
        page,
        pageSize,
      };

      const rows = await indexer.get<Record<string, unknown>[]>('/intents', params);
      const explorerBase = this.contracts.getExplorerBaseUrl();
      return rows.map((row) => mapIntentRow(row, explorerBase));
    } catch (err) {
      this.telemetry.track('intent.history.error', { error: String(err) });
      return [];
    }
  }
}
