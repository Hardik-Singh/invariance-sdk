import type { ContractFactory } from '../../core/ContractFactory.js';
import type { InvarianceEventEmitter } from '../../core/EventEmitter.js';
import type { Telemetry } from '../../core/Telemetry.js';
import { ErrorCode } from '@invariance/common';
import { InvarianceError } from '../../errors/InvarianceError.js';
import { IndexerClient } from '../../utils/indexer-client.js';
import { X402PaymentClient } from './X402Client.js';
import type {
  PayForActionOptions,
  PaymentReceipt,
  PaymentVerification,
  PaymentHistoryFilters,
  PaymentEstimate,
  X402Settings,
} from './types.js';

/**
 * Manages x402 payment protocol operations.
 *
 * Provides pay-per-action execution, payment verification, and
 * agent-to-agent payments using the x402 HTTP payment standard.
 * Payments are made in USDC on Base.
 *
 * @example
 * ```typescript
 * // Pay for an action
 * const receipt = await inv.x402.payForAction({
 *   action: 'swap',
 *   amount: '1.00',
 *   recipient: '0xServiceProvider',
 * });
 *
 * // Verify a payment
 * const verification = await inv.x402.verifyPayment(receipt.paymentId);
 *
 * // Query payment history
 * const history = await inv.x402.history('agent-identity-id');
 * ```
 */
export class X402Manager {
  private readonly contracts: ContractFactory;
  private readonly events: InvarianceEventEmitter;
  private readonly telemetry: Telemetry;
  private paymentClient: X402PaymentClient | null = null;
  private indexer: IndexerClient | null = null;
  private receipts: Map<string, PaymentReceipt> = new Map();
  private static readonly MAX_RECEIPTS = 1000;

  constructor(
    contracts: ContractFactory,
    events: InvarianceEventEmitter,
    telemetry: Telemetry,
  ) {
    this.contracts = contracts;
    this.events = events;
    this.telemetry = telemetry;
  }

  /** Lazily initialize the payment client */
  private getPaymentClient(): X402PaymentClient {
    if (!this.paymentClient) {
      const chainId = this.contracts.getChainId();
      this.paymentClient = new X402PaymentClient(chainId);
    }
    return this.paymentClient;
  }

  /** Lazily initialize the indexer client */
  private getIndexer(): IndexerClient {
    if (!this.indexer) {
      this.indexer = new IndexerClient(this.contracts.getApiBaseUrl());
    }
    return this.indexer;
  }

  /**
   * Pay for an action via the x402 protocol.
   *
   * Creates a USDC payment authorization and returns a receipt
   * that can be attached to intent requests for policy verification.
   *
   * @param opts - Payment options including action, amount, and recipient
   * @returns Payment receipt with proof
   */
  async payForAction(opts: PayForActionOptions): Promise<PaymentReceipt> {
    this.telemetry.track('x402.payForAction', {
      action: opts.action,
      amount: opts.amount,
    });

    try {
      const client = this.getPaymentClient();

      // Get signer from wallet client
      const walletClient = this.contracts.getWalletClient();
      if (!walletClient) {
        throw new InvarianceError(
          ErrorCode.WALLET_NOT_CONNECTED,
          'Wallet not connected. A signer is required for x402 payments.',
        );
      }

      const account = walletClient.account;
      if (!account) {
        throw new InvarianceError(
          ErrorCode.WALLET_NOT_CONNECTED,
          'Wallet account not available. A signer is required for x402 payments.',
        );
      }

      const signer = {
        address: account.address,
        signTypedData: async (message: {
          domain: Record<string, unknown>;
          types: Record<string, unknown>;
          primaryType: string;
          message: Record<string, unknown>;
        }) => {
          return walletClient.signTypedData({
            account,
            domain: message.domain as Record<string, unknown>,
            types: message.types as Record<string, readonly { name: string; type: string }[]>,
            primaryType: message.primaryType,
            message: message.message,
          }) as Promise<`0x${string}`>;
        },
      };

      const receipt = await client.createPayment(
        signer,
        opts.amount,
        opts.recipient,
        opts.action,
      );

      // Cache the receipt for later verification
      if (this.receipts.size >= X402Manager.MAX_RECEIPTS) {
        const oldest = this.receipts.keys().next().value;
        if (oldest !== undefined) this.receipts.delete(oldest);
      }
      this.receipts.set(receipt.paymentId, receipt);

      this.events.emit('payment.completed', {
        paymentId: receipt.paymentId,
        action: opts.action,
        amount: opts.amount,
      });

      return receipt;
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown error';

      this.events.emit('payment.failed', {
        action: opts.action,
        reason,
      });

      if (err instanceof InvarianceError) throw err;

      throw new InvarianceError(
        ErrorCode.PAYMENT_FAILED,
        `Payment for action "${opts.action}" failed: ${reason}`,
      );
    }
  }

  /**
   * Verify a payment by receipt ID.
   *
   * Checks that the payment proof is valid and the amount
   * meets requirements.
   *
   * @param receiptId - The payment receipt ID to verify
   * @returns Verification result
   */
  async verifyPayment(receiptId: string): Promise<PaymentVerification> {
    this.telemetry.track('x402.verifyPayment');

    // Check local cache first
    const cached = this.receipts.get(receiptId);
    if (cached) {
      const client = this.getPaymentClient();
      return client.verifyPayment(cached);
    }

    // Try indexer
    const indexer = this.getIndexer();
    const available = await indexer.isAvailable();
    if (available) {
      try {
        const receipt = await indexer.get<PaymentReceipt>(`/payments/${receiptId}`);
        const client = this.getPaymentClient();
        return client.verifyPayment(receipt);
      } catch {
        // Fall through
      }
    }

    return {
      valid: false,
      reason: `Payment receipt not found: ${receiptId}`,
    };
  }

  /**
   * Query payment history for an identity.
   *
   * @param identityId - The identity to query payments for
   * @param filters - Optional filters for action, time range, pagination
   * @returns Array of payment receipts
   */
  async history(identityId: string, filters?: PaymentHistoryFilters): Promise<PaymentReceipt[]> {
    this.telemetry.track('x402.history', { hasFilters: filters !== undefined });

    const indexer = this.getIndexer();
    const available = await indexer.isAvailable();

    if (available) {
      try {
        const params: Record<string, string | number | undefined> = {
          identityId,
          action: filters?.action,
          from: filters?.from !== undefined ? String(filters.from) : undefined,
          to: filters?.to !== undefined ? String(filters.to) : undefined,
          limit: filters?.limit,
          offset: filters?.offset,
        };
        return await indexer.get<PaymentReceipt[]>('/payments', params);
      } catch {
        // Fall through to local cache
      }
    }

    // Fallback: return matching receipts from local cache
    const results: PaymentReceipt[] = [];
    for (const receipt of this.receipts.values()) {
      if (filters?.action && receipt.action !== filters.action) continue;
      results.push(receipt);
    }
    return results;
  }

  /**
   * Estimate the cost for an action.
   *
   * @param opts - Estimation options
   * @returns Cost estimate
   */
  async estimateCost(opts: { action: string; recipient?: string }): Promise<PaymentEstimate> {
    this.telemetry.track('x402.estimateCost', { action: opts.action });

    // Query indexer for pricing if available
    const indexer = this.getIndexer();
    const available = await indexer.isAvailable();

    if (available) {
      try {
        const params: Record<string, string | number | undefined> = {
          action: opts.action,
          recipient: opts.recipient,
        };
        return await indexer.get<PaymentEstimate>('/payments/estimate', params);
      } catch {
        // Fall through to default estimate
      }
    }

    // Default estimate
    return {
      amount: '0.01',
      action: opts.action,
      required: false,
    };
  }

  /**
   * Configure x402 module settings.
   *
   * @param settings - Configuration options
   */
  async configure(settings: X402Settings): Promise<void> {
    this.telemetry.track('x402.configure');
    const client = this.getPaymentClient();
    client.configure(settings);
  }
}
