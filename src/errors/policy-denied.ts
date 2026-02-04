import { InvarianceError } from './base.js';
import type { Policy } from '@invariance/common';

/**
 * Error thrown when an action is denied by a policy rule.
 */
export class PolicyDeniedError extends InvarianceError {
  /** The action type that was denied */
  readonly actionType: string;

  /** The policy that caused the denial */
  readonly policy: Policy | undefined;

  constructor(message: string, actionType: string, policy?: Policy) {
    super(message, 'POLICY_DENIED');
    this.name = 'PolicyDeniedError';
    this.actionType = actionType;
    this.policy = policy ?? undefined;
  }
}

/**
 * @deprecated Use PolicyDeniedError instead
 */
export class PermissionDeniedError extends PolicyDeniedError {
  constructor(message: string, actionType: string, policy?: Policy) {
    super(message, actionType, policy);
    this.name = 'PermissionDeniedError';
  }
}
