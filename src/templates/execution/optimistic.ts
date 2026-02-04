/**
 * Optimistic execution handler.
 */

import type { OptimisticExecutionMode, ActionInput, VerificationContext } from '@invariance/common';
import type { ExecutionHandler, ExecutionResult } from './handler.js';

export class OptimisticExecutor implements ExecutionHandler<OptimisticExecutionMode> {
  async execute(
    mode: OptimisticExecutionMode,
    action: ActionInput,
    context: VerificationContext,
  ): Promise<ExecutionResult> {
    const challengeDeadline = context.timestamp + mode.challengePeriodSeconds * 1000;

    return {
      success: true,
      data: {
        mode: 'optimistic',
        action: action.type,
        challengePeriodSeconds: mode.challengePeriodSeconds,
        challengeDeadline,
        challengeBond: mode.challengeBond?.toString(),
        status: 'pending-challenge-period',
      },
    };
  }
}
