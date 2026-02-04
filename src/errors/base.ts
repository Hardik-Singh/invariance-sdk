/**
 * Base error class for all Invariance SDK errors.
 */
export class InvarianceError extends Error {
  /** Error code for programmatic handling */
  readonly code: string;

  constructor(message: string, code = 'INVARIANCE_ERROR') {
    super(message);
    this.name = 'InvarianceError';
    this.code = code;

    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, InvarianceError);
    }
  }
}
