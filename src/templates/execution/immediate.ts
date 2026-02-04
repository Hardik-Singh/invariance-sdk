/**
 * Immediate execution handler.
 */

import type { ImmediateExecutionMode, ActionInput, VerificationContext } from '@invariance/common';
import type { ExecutionHandler, ExecutionResult } from './handler.js';

export class ImmediateExecutor implements ExecutionHandler<ImmediateExecutionMode> {
  async execute(
    mode: ImmediateExecutionMode,
    action: ActionInput,
    context: VerificationContext,
  ): Promise<ExecutionResult> {
    // In production, this would submit the transaction
    // For now, return a placeholder result
    return {
      success: true,
      data: {
        mode: 'immediate',
        action: action.type,
        sender: context.sender,
        waitForConfirmation: mode.waitForConfirmation,
        confirmations: mode.confirmations,
      },
    };
  }
}
