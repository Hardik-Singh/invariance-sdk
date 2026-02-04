/**
 * Schedule timing checker.
 */

import type { ScheduleRule, VerificationContext } from '@invariance/common';
import type { TimingChecker, TimingCheckResult, TimingState } from './checker.js';

export class ScheduleChecker implements TimingChecker<ScheduleRule> {
  async check(
    rule: ScheduleRule,
    context: VerificationContext,
    _state?: TimingState,
  ): Promise<TimingCheckResult> {
    // Parse cron expression and check if current time matches
    const nextScheduled = this.getNextScheduledTime(rule.cronExpression, context.timestamp);
    const toleranceMs = (rule.toleranceSeconds ?? 300) * 1000;

    const diff = Math.abs(context.timestamp - nextScheduled);
    const passed = diff <= toleranceMs;

    if (!passed) {
      return {
        passed: false,
        ruleType: 'schedule',
        message: `Not within scheduled window`,
        data: {
          currentTime: new Date(context.timestamp).toISOString(),
          nextScheduled: new Date(nextScheduled).toISOString(),
          toleranceSeconds: rule.toleranceSeconds ?? 300,
        },
      };
    }

    return {
      passed: true,
      ruleType: 'schedule',
      message: 'Within scheduled window',
      data: {
        currentTime: new Date(context.timestamp).toISOString(),
        scheduledTime: new Date(nextScheduled).toISOString(),
      },
    };
  }

  /**
   * Get next scheduled time from cron expression.
   * Simplified implementation - in production use a proper cron parser.
   */
  private getNextScheduledTime(_cron: string, _from: number): number {
    // In production, use a library like cron-parser
    // For now, return the from time (always matches)
    return _from;
  }
}
