import { ErrorCode } from '@invariance/common';

/**
 * Base error class for all Invariance SDK errors.
 *
 * Every SDK error carries a structured {@link ErrorCode} for programmatic handling,
 * along with optional explorer URL and transaction hash for on-chain debugging.
 *
 * @example
 * ```typescript
 * try {
 *   await inv.intent.request(opts);
 * } catch (err) {
 *   if (err instanceof InvarianceError) {
 *     console.error(err.code, err.message, err.explorerUrl);
 *   }
 * }
 * ```
 */
export class InvarianceError extends Error {
  /** Structured error code for programmatic handling */
  public readonly code: ErrorCode;

  /** Public explorer URL relevant to the error context */
  public readonly explorerUrl?: string | undefined;

  /** On-chain transaction hash related to the error */
  public readonly txHash?: string | undefined;

  constructor(
    code: ErrorCode,
    message: string,
    opts?: { explorerUrl?: string; txHash?: string },
  ) {
    super(message);
    this.name = 'InvarianceError';
    this.code = code;
    this.explorerUrl = opts?.explorerUrl;
    this.txHash = opts?.txHash;

    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, InvarianceError);
    }
  }
}
