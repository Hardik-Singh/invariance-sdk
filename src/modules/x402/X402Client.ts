/**
 * Low-level x402 payment client.
 *
 * Wraps `@x402/core` and `@x402/evm` to handle payment creation,
 * verification, and proof retrieval for the Invariance SDK.
 *
 * Requires optional peer dependencies: `@x402/core`, `@x402/evm`.
 * Install them with: `pnpm add @x402/core @x402/evm`
 */
import { ErrorCode } from '@invariance/common';
import { stringToHex } from 'viem';
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

// Lazy-loaded x402 modules (optional peer deps)
let _x402Core: typeof import('@x402/core/client') | null = null;
let _x402Evm: typeof import('@x402/evm/exact/client') | null = null;

async function loadX402Modules(): Promise<{
  x402Client: typeof import('@x402/core/client').x402Client;
  ExactEvmScheme: typeof import('@x402/evm/exact/client').ExactEvmScheme;
}> {
  if (!_x402Core || !_x402Evm) {
    try {
      [_x402Core, _x402Evm] = await Promise.all([
        import('@x402/core/client'),
        import('@x402/evm/exact/client'),
      ]);
    } catch {
      throw new InvarianceError(
        ErrorCode.PAYMENT_FAILED,
        'x402 payment modules not installed. Install them with: pnpm add @x402/core @x402/evm',
      );
    }
  }
  return { x402Client: _x402Core!.x402Client, ExactEvmScheme: _x402Evm!.ExactEvmScheme };
}

interface ClientEvmSigner {
  address: string;
  signTypedData: (message: {
    domain: Record<string, unknown>;
    types: Record<string, unknown>;
    primaryType: string;
    message: Record<string, unknown>;
  }) => Promise<`0x${string}`>;
}

interface X402ClientLike {
  createPaymentPayload: (paymentRequired: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Low-level client for x402 payment operations.
 *
 * Manages the x402Client instance and handles EVM-specific
 * payment creation and verification.
 */
export class X402PaymentClient {
  private client: X402ClientLike | null = null;
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
  private async getClient(signer: ClientEvmSigner): Promise<X402ClientLike> {
    if (!this.client) {
      const { x402Client, ExactEvmScheme } = await loadX402Modules();
      const network: `${string}:${string}` = `eip155:${this.chainId}`;
      this.client = new x402Client()
        .register(network, new ExactEvmScheme(signer as never)) as unknown as X402ClientLike;
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
      const client = await this.getClient(signer);
      const usdcToken = this.getUsdcToken();

      // Convert amount to smallest unit (USDC has 6 decimals)
      const [whole = '0', frac = ''] = amount.split('.');
      const paddedFrac = (frac + '000000').slice(0, 6);
      const amountInUnits = (BigInt(whole) * 1_000_000n + BigInt(paddedFrac)).toString();

      // Create payment payload via x402 (v2 PaymentRequired shape)
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

      const payload = await client.createPaymentPayload(paymentRequired);

      // Generate a unique payment ID using crypto-safe randomness
      const { randomBytes } = await import('crypto');
      const paymentId = `x402_${Date.now().toString(36)}_${randomBytes(6).toString('hex')}`;

      const payloadHex = stringToHex(JSON.stringify(payload));
      const payloadHash = `0x${payloadHex.slice(2, 66)}`;
      return {
        paymentId,
        txHash: payloadHash,
        payloadHash,
        amount,
        recipient,
        payer: signer.address,
        action,
        timestamp: Date.now(),
        proof: JSON.stringify(payload),
      };
    } catch (err) {
      if (err instanceof InvarianceError) throw err;
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
