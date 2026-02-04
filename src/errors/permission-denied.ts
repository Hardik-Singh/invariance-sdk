import { InvarianceError } from './base.js';
import type { Permission } from '@invariance/common';

/**
 * Error thrown when an action is denied by a permission rule.
 */
export class PermissionDeniedError extends InvarianceError {
  /** The action type that was denied */
  readonly actionType: string;

  /** The permission that caused the denial */
  readonly permission?: Permission;

  constructor(message: string, actionType: string, permission?: Permission) {
    super(message, 'PERMISSION_DENIED');
    this.name = 'PermissionDeniedError';
    this.actionType = actionType;
    this.permission = permission;
  }
}
