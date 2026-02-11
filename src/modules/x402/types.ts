/**
 * Types for the x402 payment protocol module.
 */

/** Options for paying for an action via x402 */
export interface PayForActionOptions {
  /** The action being paid for */
  action: string;
  /** Payment amount in USDC (decimal string, e.g. '1.50') */
  amount: string;
  /** Payment recipient address */
  recipient: string;
  /** Identity ID of the payer */
  identityId?: string;
  /** x402 facilitator URL */
  facilitatorUrl?: string;
  /** Additional metadata to attach to the payment */
  metadata?: Record<string, unknown>;
}

/** Receipt returned after a successful payment */
export interface PaymentReceipt {
  /** Unique payment identifier */
  paymentId: string;
  /** On-chain transaction hash */
  txHash: string;
  /** Payment amount in USDC */
  amount: string;
  /** Recipient address */
  recipient: string;
  /** Payer address */
  payer: string;
  /** The action this payment is for */
  action: string;
  /** Unix timestamp of payment */
  timestamp: number;
  /** Cryptographic proof of payment */
  proof: string;
}

/** Result of verifying a payment */
export interface PaymentVerification {
  /** Whether the payment is valid */
  valid: boolean;
  /** The verified receipt */
  receipt?: PaymentReceipt;
  /** Reason for failure, if invalid */
  reason?: string;
}

/** Filters for querying payment history */
export interface PaymentHistoryFilters {
  /** Filter by action type */
  action?: string;
  /** Start of time range (unix timestamp or ISO string) */
  from?: string | number;
  /** End of time range (unix timestamp or ISO string) */
  to?: string | number;
  /** Maximum number of results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/** Estimated cost for an action */
export interface PaymentEstimate {
  /** Estimated USDC cost */
  amount: string;
  /** The action being estimated */
  action: string;
  /** Whether a payment is required for this action */
  required: boolean;
  /** Breakdown of cost components */
  breakdown?: {
    baseCost: string;
    gasCost: string;
    facilitatorFee: string;
  };
}

/** x402 module configuration */
export interface X402Settings {
  /** Default facilitator URL for x402 payments */
  facilitatorUrl?: string;
  /** Default payment recipient address */
  defaultRecipient?: string;
  /** Maximum auto-approve amount in USDC (payments above this require explicit approval) */
  maxAutoApprove?: string;
  /** USDC token address override (defaults to chain-specific address) */
  usdcAddress?: string;
  /** Whether to use Permit2 transfer method (default: false, uses EIP-3009) */
  usePermit2?: boolean;
}
