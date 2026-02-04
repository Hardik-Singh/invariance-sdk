/**
 * Epoch-based timing checker.
 */

import type { EpochBasedRule, VerificationContext } from '@invariance/common';
import type { TimingChecker, TimingCheckResult, TimingState } from './checker.js';

export class EpochBasedChecker implements TimingChecker<EpochBasedRule> {
  async check(
    rule: EpochBasedRule,
    context: VerificationContext,
    state?: TimingState,
  ): Promise<TimingCheckResult> {
    const currentEpoch = this.getCurrentEpoch(rule, context);

    // Check if epoch is in allowed list (if specified)
    if (rule.allowedEpochs && rule.allowedEpochs.length > 0) {
      if (!rule.allowedEpochs.includes(currentEpoch)) {
        return {
          passed: false,
          ruleType: 'epoch-based',
          message: `Epoch ${currentEpoch} not in allowed list`,
          data: {
            currentEpoch,
            allowedEpochs: rule.allowedEpochs,
          },
        };
      }
    }

    // Check executions per epoch
    const epochKey = `epoch:${currentEpoch}`;
    const executionsThisEpoch = state?.executionCounts?.get(epochKey) ?? 0;

    if (executionsThisEpoch >= rule.maxPerEpoch) {
      return {
        passed: false,
        ruleType: 'epoch-based',
        message: `Epoch limit reached: ${executionsThisEpoch}/${rule.maxPerEpoch}`,
        data: {
          currentEpoch,
          executions: executionsThisEpoch,
          maxPerEpoch: rule.maxPerEpoch,
        },
      };
    }

    return {
      passed: true,
      ruleType: 'epoch-based',
      message: 'Epoch check passed',
      data: {
        currentEpoch,
        executionsThisEpoch,
        maxPerEpoch: rule.maxPerEpoch,
      },
    };
  }

  private getCurrentEpoch(rule: EpochBasedRule, context: VerificationContext): number {
    if (rule.epochConfig.epochType === 'time') {
      const elapsed = context.timestamp - rule.epochConfig.epochStart;
      return Math.floor(elapsed / (rule.epochConfig.epochDuration * 1000));
    } else {
      const blocksSinceStart = context.blockNumber - rule.epochConfig.startBlock;
      return Math.floor(blocksSinceStart / rule.epochConfig.blocksPerEpoch);
    }
  }
}
