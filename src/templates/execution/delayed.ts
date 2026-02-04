/**
 * Delayed execution handler.
 */

import type { DelayedExecutionMode, ActionInput, VerificationContext } from '@invariance/common';
import type { ExecutionHandler, ExecutionResult } from './handler.js';

export class DelayedExecutor implements ExecutionHandler<DelayedExecutionMode> {
  async execute(
    mode: DelayedExecutionMode,
    action: ActionInput,
    context: VerificationContext,
  ): Promise<ExecutionResult> {
    const executeAt = context.timestamp + mode.delaySeconds * 1000;

    return {
      success: true,
      data: {
        mode: 'delayed',
        action: action.type,
        delaySeconds: mode.delaySeconds,
        executeAt,
        cancellable: mode.cancellable,
        status: 'queued',
      },
    };
  }
}
