/**
 * Time-locked authorization checker.
 */

import type { TimeLockedAuthorization, VerificationContext } from '@invariance/common';
import type { AuthorizationChecker, AuthorizationCheckResult } from './checker.js';

/**
 * Proof data for time-lock verification.
 */
export interface TimeLockProofData {
  /** When the action was queued */
  queuedAt: number;
  /** Action hash/ID */
  actionId?: string;
  /** Whether the action has been cancelled */
  cancelled?: boolean;
}

/**
 * Checks time-locked authorization.
 */
export class TimeLockedChecker implements AuthorizationChecker<TimeLockedAuthorization> {
  async check(
    rule: TimeLockedAuthorization,
    context: VerificationContext,
    proof?: unknown,
  ): Promise<AuthorizationCheckResult> {
    if (!proof) {
      return {
        passed: false,
        ruleType: 'time-locked',
        message: `Action must be queued with ${rule.delaySeconds}s delay`,
        data: {
          delaySeconds: rule.delaySeconds,
          cancellable: rule.cancellable ?? false,
        },
      };
    }

    const proofData = proof as TimeLockProofData;

    // Check if cancelled
    if (proofData.cancelled) {
      return {
        passed: false,
        ruleType: 'time-locked',
        message: 'Action was cancelled',
        data: { actionId: proofData.actionId },
      };
    }

    // Check if delay has passed
    const elapsed = context.timestamp - proofData.queuedAt;
    const delayMs = rule.delaySeconds * 1000;

    if (elapsed < delayMs) {
      const remaining = Math.ceil((delayMs - elapsed) / 1000);
      return {
        passed: false,
        ruleType: 'time-locked',
        message: `Time-lock active: ${remaining}s remaining`,
        data: {
          queuedAt: proofData.queuedAt,
          delaySeconds: rule.delaySeconds,
          remainingSeconds: remaining,
        },
      };
    }

    // Check max delay if specified
    if (rule.maxDelaySeconds) {
      const maxDelayMs = rule.maxDelaySeconds * 1000;
      if (elapsed > maxDelayMs) {
        return {
          passed: false,
          ruleType: 'time-locked',
          message: 'Action expired - exceeded maximum delay',
          data: {
            elapsed: elapsed / 1000,
            maxDelaySeconds: rule.maxDelaySeconds,
          },
        };
      }
    }

    return {
      passed: true,
      ruleType: 'time-locked',
      message: 'Time-lock delay satisfied',
      data: {
        queuedAt: proofData.queuedAt,
        delaySeconds: rule.delaySeconds,
        elapsed: elapsed / 1000,
      },
    };
  }
}
