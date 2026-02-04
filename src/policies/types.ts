import type { ActionInput, PolicyCheckResult } from '@invariance/common';

/**
 * Base interface for execution policy classes.
 */
export interface ExecutionPolicy {
  /** Policy type identifier */
  readonly type: string;

  /** Whether this policy is currently active */
  isActive(): boolean;

  /** Check if an action passes this policy */
  check(action: ActionInput): PolicyCheckResult;
}

/**
 * Extended interface for policies that require async operations.
 * Used by VotingPolicy and HumanApprovalPolicy which need
 * to collect votes/approvals before returning a result.
 */
export interface AsyncExecutionPolicy extends ExecutionPolicy {
  /** Indicates this policy requires async resolution */
  readonly requiresAsync: boolean;

  /**
   * Asynchronously check if an action is permitted.
   * This method may initiate voting or approval requests and
   * wait for the required consensus/approval.
   *
   * @param action - The action to check
   * @returns Promise resolving to the policy check result
   */
  checkAsync(action: ActionInput): Promise<PolicyCheckResult>;
}

/**
 * Type guard to check if an execution policy supports async operations.
 *
 * @param policy - The execution policy to check
 * @returns True if the policy implements AsyncExecutionPolicy
 */
export function isAsyncPolicy(
  policy: ExecutionPolicy,
): policy is AsyncExecutionPolicy {
  return 'checkAsync' in policy && 'requiresAsync' in policy;
}

// ============================================================================
// Backward Compatibility - Deprecated Type Aliases
// ============================================================================

/**
 * @deprecated Use ExecutionPolicy instead
 */
export type PermissionTemplate = ExecutionPolicy;

/**
 * @deprecated Use AsyncExecutionPolicy instead
 */
export type AsyncPermissionTemplate = AsyncExecutionPolicy;

/**
 * @deprecated Use isAsyncPolicy instead
 */
export const isAsyncPermission = isAsyncPolicy;
