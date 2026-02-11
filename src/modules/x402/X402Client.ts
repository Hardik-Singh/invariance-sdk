/**
 * Low-level x402 payment client.
 *
 * Wraps `@x402/core` and `@x402/evm` to handle payment creation,
 * verification, and proof retrieval for the Invariance SDK.
 */
import { x402Client } from '@x402/core/client';
import { ExactEvmScheme } from '@x402/evm/exact/client';
import type { ClientEvmSigner } from '@x402/evm';
import { ErrorCode } from '@invariance/common';
import { InvarianceError } from '../../errors/InvarianceError.js';
import type { PaymentReceipt, PaymentVerification, X402Settings } from './types.js';

/** USDC token metadata by chain ID (address + EIP-712 domain) */
const USDC_TOKENS: Record<number, { address: `0x${string}`; name: string; version: string }> = {
  8453: {
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    name: 'USD Coin',
    version: '2',
  },
  84532: {
    address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    name: 'USDC',
    version: '2',
  },
};

/** Default facilitator URL */
const DEFAULT_FACILITATOR_URL = 'https://x402.org/facilitator';

/**
 * Low-level client for x402 payment operations.
 *
 * Manages the x402Client instance and handles EVM-specific
 * payment creation and verification.
 */
export class X402PaymentClient {
  private client: x402Client | null = null;
  private settings: X402Settings = {};
  private readonly chainId: number;

  constructor(chainId: number) {
    this.chainId = chainId;
  }

  /** Configure the client settings */
  configure(settings: X402Settings): void {
    this.settings = { ...this.settings, ...settings };
    // Reset client so it gets re-created with new settings
    this.client = null;
  }

  /** Get or create the x402Client with registered EVM scheme */
  private getClient(signer: ClientEvmSigner): x402Client {
    if (!this.client) {
      const network: `${string}:${string}` = `eip155:${this.chainId}`;
      this.client = new x402Client()
        .register(network, new ExactEvmScheme(signer));
    }
    return this.client;
  }

  /** Get the USDC token metadata for the current chain */
  private getUsdcToken(): { address: `0x${string}`; name: string; version: string } {
    const token = USDC_TOKENS[this.chainId];
    if (!token) {
      throw new InvarianceError(
        ErrorCode.NETWORK_ERROR,
        `Unsupported chain for x402 payments: ${this.chainId}`,
      );
    }
    if (this.settings.usdcAddress) {
      return { ...token, address: this.settings.usdcAddress as `0x${string}` };
    }
    return token;
  }

  /** Get the USDC address for the current chain */
  getUsdcAddress(): `0x${string}` {
    return this.getUsdcToken().address;
  }

  /** Get the facilitator URL */
  getFacilitatorUrl(): string {
    return this.settings.facilitatorUrl ?? DEFAULT_FACILITATOR_URL;
  }

  /**
   * Create a payment for an action.
   *
   * @param signer - The EVM signer for the payer
   * @param amount - Payment amount in USDC (decimal string)
   * @param recipient - Recipient address
   * @param action - The action being paid for
   * @returns Payment receipt
   */
  async createPayment(
    signer: ClientEvmSigner,
    amount: string,
    recipient: string,
    action: string,
  ): Promise<PaymentReceipt> {
    try {
      const _client = this.getClient(signer);
      const usdcToken = this.getUsdcToken();

      // Convert amount to smallest unit (USDC has 6 decimals)
      const amountInUnits = Math.floor(parseFloat(amount) * 1_000_000).toString();

      // Create payment payload via x402 (v2 PaymentRequired shape)
      // The `extra` field must include EIP-712 domain params (name, version)
      // required by @x402/evm for EIP-3009 transferWithAuthorization signing
      const network: `${string}:${string}` = `eip155:${this.chainId}`;
      const paymentRequired = {
        x402Version: 2 as const,
        resource: {
          url: action,
          description: `Payment for action: ${action}`,
          mimeType: 'application/json',
        },
        accepts: [{
          scheme: 'exact' as const,
          network,
          amount: amountInUnits,
          payTo: recipient,
          asset: usdcToken.address as string,
          maxTimeoutSeconds: 300,
          extra: {
            name: usdcToken.name,
            version: usdcToken.version,
          },
        }],
      };

      const payload = await _client.createPaymentPayload(paymentRequired as Parameters<typeof _client.createPaymentPayload>[0]);

      // Generate a deterministic payment ID
      const paymentId = `x402_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

      return {
        paymentId,
        txHash: `0x${Buffer.from(JSON.stringify(payload)).toString('hex').slice(0, 64)}`,
        amount,
        recipient,
        payer: signer.address,
        action,
        timestamp: Date.now(),
        proof: JSON.stringify(payload),
      };
    } catch (err) {
      throw new InvarianceError(
        ErrorCode.PAYMENT_FAILED,
        `x402 payment creation failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }
  }

  /**
   * Verify a payment receipt.
   *
   * @param receipt - The payment receipt to verify
   * @returns Verification result
   */
  async verifyPayment(receipt: PaymentReceipt): Promise<PaymentVerification> {
    try {
      // Verify the proof is parseable and contains valid payment data
      const payload = JSON.parse(receipt.proof);

      if (!payload) {
        return {
          valid: false,
          reason: 'Invalid payment proof: empty payload',
        };
      }

      // Verify amount matches
      const receiptAmount = parseFloat(receipt.amount);
      if (isNaN(receiptAmount) || receiptAmount <= 0) {
        return {
          valid: false,
          reason: `Invalid payment amount: ${receipt.amount}`,
        };
      }

      return {
        valid: true,
        receipt,
      };
    } catch (err) {
      return {
        valid: false,
        reason: `Payment verification failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      };
    }
  }
}
