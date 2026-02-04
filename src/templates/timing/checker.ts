/**
 * Timing rule checker dispatcher.
 */

import type { TimingRule, VerificationContext } from '@invariance/common';
import { TimeWindowChecker } from './time-window.js';
import { CooldownChecker } from './cooldown.js';
import { AfterTimestampChecker } from './after-timestamp.js';
import { BeforeTimestampChecker } from './before-timestamp.js';
import { ScheduleChecker } from './schedule.js';
import { BlockDelayChecker } from './block-delay.js';
import { EpochBasedChecker } from './epoch-based.js';
import { EventTriggeredChecker } from './event-triggered.js';

/**
 * Result of a timing check.
 */
export interface TimingCheckResult {
  passed: boolean;
  ruleType: string;
  message?: string;
  data?: Record<string, unknown>;
}

/**
 * Interface for timing checker implementations.
 */
export interface TimingChecker<T extends TimingRule = TimingRule> {
  check(rule: T, context: VerificationContext, state?: TimingState): Promise<TimingCheckResult>;
}

/**
 * State for timing checks (cooldowns, counters, etc.)
 */
export interface TimingState {
  lastExecution?: Map<string, number>;
  executionCounts?: Map<string, number>;
  lastEvent?: { blockNumber: number; timestamp: number };
}

/**
 * Check a timing rule against context.
 */
export async function checkTiming(
  rule: TimingRule,
  context: VerificationContext,
  state?: TimingState,
): Promise<TimingCheckResult> {
  switch (rule.type) {
    case 'time-window': {
      const checker = new TimeWindowChecker();
      return checker.check(rule, context, state);
    }
    case 'cooldown': {
      const checker = new CooldownChecker();
      return checker.check(rule, context, state);
    }
    case 'after-timestamp': {
      const checker = new AfterTimestampChecker();
      return checker.check(rule, context, state);
    }
    case 'before-timestamp': {
      const checker = new BeforeTimestampChecker();
      return checker.check(rule, context, state);
    }
    case 'schedule': {
      const checker = new ScheduleChecker();
      return checker.check(rule, context, state);
    }
    case 'block-delay': {
      const checker = new BlockDelayChecker();
      return checker.check(rule, context, state);
    }
    case 'epoch-based': {
      const checker = new EpochBasedChecker();
      return checker.check(rule, context, state);
    }
    case 'event-triggered': {
      const checker = new EventTriggeredChecker();
      return checker.check(rule, context, state);
    }
    default: {
      return {
        passed: false,
        ruleType: 'unknown',
        message: `Unknown timing type: ${(rule as TimingRule).type}`,
      };
    }
  }
}
