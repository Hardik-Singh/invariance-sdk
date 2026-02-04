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

/**
 * Extended interface for permissions that require async operations.
 * Used by VotingPermission and HumanApprovalPermission which need
 * to collect votes/approvals before returning a result.
 */
export interface AsyncPermissionTemplate extends PermissionTemplate {
  /** Indicates this permission requires async resolution */
  readonly requiresAsync: boolean;

  /**
   * Asynchronously check if an action is permitted.
   * This method may initiate voting or approval requests and
   * wait for the required consensus/approval.
   *
   * @param action - The action to check
   * @returns Promise resolving to the permission check result
   */
  checkAsync(action: ActionInput): Promise<PermissionCheckResult>;
}

/**
 * Type guard to check if a permission template supports async operations.
 *
 * @param template - The permission template to check
 * @returns True if the template implements AsyncPermissionTemplate
 */
export function isAsyncPermission(
  template: PermissionTemplate,
): template is AsyncPermissionTemplate {
  return 'checkAsync' in template && 'requiresAsync' in template;
}
