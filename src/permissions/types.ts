import type { ActionInput, PermissionCheckResult } from '@invariance/common';

/**
 * Base interface for permission template classes.
 */
export interface PermissionTemplate {
  /** Permission type identifier */
  readonly type: string;

  /** Whether this permission is currently active */
  isActive(): boolean;

  /** Check if an action passes this permission */
  check(action: ActionInput): PermissionCheckResult;
}
