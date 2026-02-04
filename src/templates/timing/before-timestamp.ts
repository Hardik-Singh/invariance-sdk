/**
 * Before timestamp timing checker.
 */

import type { BeforeTimestampRule, VerificationContext } from '@invariance/common';
import type { TimingChecker, TimingCheckResult, TimingState } from './checker.js';

export class BeforeTimestampChecker implements TimingChecker<BeforeTimestampRule> {
  async check(
    rule: BeforeTimestampRule,
    context: VerificationContext,
    _state?: TimingState,
  ): Promise<TimingCheckResult> {
    const targetMs = rule.timestamp * 1000;
    const currentMs = context.timestamp;

    const passed = rule.inclusive
      ? currentMs <= targetMs
      : currentMs < targetMs;

    if (!passed) {
      const overBy = Math.ceil((currentMs - targetMs) / 1000);
      return {
        passed: false,
        ruleType: 'before-timestamp',
        message: `Deadline passed: ${overBy}s ago`,
        data: {
          currentTimestamp: currentMs,
          targetTimestamp: targetMs,
          overBySeconds: overBy,
        },
      };
    }

    return {
      passed: true,
      ruleType: 'before-timestamp',
      message: 'Before deadline',
      data: {
        currentTimestamp: currentMs,
        targetTimestamp: targetMs,
      },
    };
  }
}
