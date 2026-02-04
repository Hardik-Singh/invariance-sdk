/**
 * Event-triggered timing checker.
 */

import type { EventTriggeredRule, VerificationContext } from '@invariance/common';
import type { TimingChecker, TimingCheckResult, TimingState } from './checker.js';

export class EventTriggeredChecker implements TimingChecker<EventTriggeredRule> {
  async check(
    rule: EventTriggeredRule,
    context: VerificationContext,
    state?: TimingState,
  ): Promise<TimingCheckResult> {
    if (!state?.lastEvent) {
      return {
        passed: false,
        ruleType: 'event-triggered',
        message: 'Required event not found',
        data: {
          contract: rule.contract,
          eventSignature: rule.eventSignature,
        },
      };
    }

    const blocksSinceEvent = context.blockNumber - state.lastEvent.blockNumber;

    // Check minimum blocks after event
    if (rule.minBlocksAfterEvent && blocksSinceEvent < rule.minBlocksAfterEvent) {
      return {
        passed: false,
        ruleType: 'event-triggered',
        message: `Too soon after event: ${blocksSinceEvent} < ${rule.minBlocksAfterEvent} blocks`,
        data: {
          blocksSinceEvent,
          minBlocksAfterEvent: rule.minBlocksAfterEvent,
        },
      };
    }

    // Check maximum blocks after event
    if (rule.maxBlocksAfterEvent && blocksSinceEvent > rule.maxBlocksAfterEvent) {
      return {
        passed: false,
        ruleType: 'event-triggered',
        message: `Too late after event: ${blocksSinceEvent} > ${rule.maxBlocksAfterEvent} blocks`,
        data: {
          blocksSinceEvent,
          maxBlocksAfterEvent: rule.maxBlocksAfterEvent,
        },
      };
    }

    return {
      passed: true,
      ruleType: 'event-triggered',
      message: 'Event trigger conditions met',
      data: {
        eventBlock: state.lastEvent.blockNumber,
        currentBlock: context.blockNumber,
        blocksSinceEvent,
      },
    };
  }
}
