import { InvarianceError } from './base.js';

/**
 * Error thrown when required on-chain state is not satisfied.
 */
export class StateFailedError extends InvarianceError {
  /** The state condition that failed */
  readonly condition: string;

  /** The expected state value */
  readonly expected?: string;

  /** The actual state value */
  readonly actual?: string;

  constructor(
    message: string,
    condition: string,
    expected?: string,
    actual?: string,
  ) {
    super(message, 'STATE_FAILED');
    this.name = 'StateFailedError';
    this.condition = condition;
    this.expected = expected;
    this.actual = actual;
  }
}
