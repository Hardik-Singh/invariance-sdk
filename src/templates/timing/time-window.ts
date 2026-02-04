/**
 * Time window timing checker.
 */

import type { TimeWindowRule, VerificationContext } from '@invariance/common';
import type { TimingChecker, TimingCheckResult, TimingState } from './checker.js';

export class TimeWindowChecker implements TimingChecker<TimeWindowRule> {
  async check(
    rule: TimeWindowRule,
    context: VerificationContext,
    _state?: TimingState,
  ): Promise<TimingCheckResult> {
    const date = new Date(context.timestamp);

    // Apply timezone offset if specified
    let hour = date.getUTCHours();
    if (rule.timezoneOffset) {
      hour = (hour + rule.timezoneOffset + 24) % 24;
    }

    const day = date.getUTCDay();

    // Check day of week
    if (!rule.allowedDays.includes(day as 0 | 1 | 2 | 3 | 4 | 5 | 6)) {
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      return {
        passed: false,
        ruleType: 'time-window',
        message: `Not allowed on ${dayNames[day]}`,
        data: {
          currentDay: day,
          allowedDays: rule.allowedDays,
        },
      };
    }

    // Check hour window
    let inWindow: boolean;
    if (rule.startHour <= rule.endHour) {
      // Normal window (e.g., 9-17)
      inWindow = hour >= rule.startHour && hour < rule.endHour;
    } else {
      // Overnight window (e.g., 22-6)
      inWindow = hour >= rule.startHour || hour < rule.endHour;
    }

    if (!inWindow) {
      return {
        passed: false,
        ruleType: 'time-window',
        message: `Outside allowed hours: current ${hour}, allowed ${rule.startHour}-${rule.endHour} UTC`,
        data: {
          currentHour: hour,
          startHour: rule.startHour,
          endHour: rule.endHour,
        },
      };
    }

    return {
      passed: true,
      ruleType: 'time-window',
      message: 'Within allowed time window',
      data: {
        currentHour: hour,
        currentDay: day,
      },
    };
  }
}
