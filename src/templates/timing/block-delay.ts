/**
 * Block delay timing checker.
 */

import type { BlockDelayRule, VerificationContext } from '@invariance/common';
import type { TimingChecker, TimingCheckResult, TimingState } from './checker.js';

export class BlockDelayChecker implements TimingChecker<BlockDelayRule> {
  async check(
    rule: BlockDelayRule,
    context: VerificationContext,
    _state?: TimingState,
  ): Promise<TimingCheckResult> {
    const referenceBlock = rule.referenceBlock ?? 0;
    const blocksPassed = context.blockNumber - referenceBlock;

    // Check minimum blocks
    if (blocksPassed < rule.minBlocks) {
      return {
        passed: false,
        ruleType: 'block-delay',
        message: `Insufficient blocks: ${blocksPassed} < ${rule.minBlocks}`,
        data: {
          currentBlock: context.blockNumber,
          referenceBlock,
          blocksPassed,
          minBlocks: rule.minBlocks,
        },
      };
    }

    // Check maximum blocks (deadline) if specified
    if (rule.maxBlocks && blocksPassed > rule.maxBlocks) {
      return {
        passed: false,
        ruleType: 'block-delay',
        message: `Block deadline passed: ${blocksPassed} > ${rule.maxBlocks}`,
        data: {
          currentBlock: context.blockNumber,
          referenceBlock,
          blocksPassed,
          maxBlocks: rule.maxBlocks,
        },
      };
    }

    return {
      passed: true,
      ruleType: 'block-delay',
      message: 'Block delay satisfied',
      data: {
        currentBlock: context.blockNumber,
        referenceBlock,
        blocksPassed,
      },
    };
  }
}
