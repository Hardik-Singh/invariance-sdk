/**
 * After timestamp timing checker.
 */

import type { AfterTimestampRule, VerificationContext } from '@invariance/common';
import type { TimingChecker, TimingCheckResult, TimingState } from './checker.js';

export class AfterTimestampChecker implements TimingChecker<AfterTimestampRule> {
  async check(
    rule: AfterTimestampRule,
    context: VerificationContext,
    _state?: TimingState,
  ): Promise<TimingCheckResult> {
    const targetMs = rule.timestamp * 1000; // Convert to milliseconds if needed
    const currentMs = context.timestamp;

    const passed = rule.inclusive
      ? currentMs >= targetMs
      : currentMs > targetMs;

    if (!passed) {
      const remaining = Math.ceil((targetMs - currentMs) / 1000);
      return {
        passed: false,
        ruleType: 'after-timestamp',
        message: `Too early: ${remaining}s until allowed`,
        data: {
          currentTimestamp: currentMs,
          targetTimestamp: targetMs,
          remainingSeconds: remaining,
        },
      };
    }

    return {
      passed: true,
      ruleType: 'after-timestamp',
      message: 'After required timestamp',
      data: {
        currentTimestamp: currentMs,
        targetTimestamp: targetMs,
      },
    };
  }
}
