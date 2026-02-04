/**
 * Execution handler interface.
 */

import type { ExecutionMode, ActionInput, VerificationContext } from '@invariance/common';

/**
 * Result of execution.
 */
export interface ExecutionResult {
  success: boolean;
  txHash?: string;
  blockNumber?: number;
  error?: string;
  data?: Record<string, unknown>;
}

/**
 * Interface for execution handlers.
 */
export interface ExecutionHandler<T extends ExecutionMode = ExecutionMode> {
  /**
   * Execute an action with the given mode.
   */
  execute(
    mode: T,
    action: ActionInput,
    context: VerificationContext,
  ): Promise<ExecutionResult>;
}
