/**
 * Cooldown timing checker.
 */

import type { CooldownRule, VerificationContext } from '@invariance/common';
import type { TimingChecker, TimingCheckResult, TimingState } from './checker.js';

export class CooldownChecker implements TimingChecker<CooldownRule> {
  async check(
    rule: CooldownRule,
    context: VerificationContext,
    state?: TimingState,
  ): Promise<TimingCheckResult> {
    if (!state?.lastExecution) {
      // No execution history, allow
      return {
        passed: true,
        ruleType: 'cooldown',
        message: 'No previous execution - cooldown not applicable',
      };
    }

    // Determine the key based on scope
    let key: string;
    switch (rule.scope) {
      case 'global':
        key = 'global';
        break;
      case 'per-address':
        key = rule.trackBy === 'sender' || !rule.trackBy
          ? context.sender.toLowerCase()
          : rule.trackBy.toLowerCase();
        break;
      case 'per-function':
        key = `function:${context.data?.['functionSelector'] ?? 'unknown'}`;
        break;
      default:
        key = 'global';
    }

    const lastExec = state.lastExecution.get(key);
    if (!lastExec) {
      return {
        passed: true,
        ruleType: 'cooldown',
        message: 'No previous execution for this scope',
        data: { scope: rule.scope, key },
      };
    }

    const elapsed = context.timestamp - lastExec;
    const cooldownMs = rule.periodSeconds * 1000;

    if (elapsed < cooldownMs) {
      const remaining = Math.ceil((cooldownMs - elapsed) / 1000);
      return {
        passed: false,
        ruleType: 'cooldown',
        message: `Cooldown active: ${remaining}s remaining`,
        data: {
          scope: rule.scope,
          elapsedSeconds: elapsed / 1000,
          cooldownSeconds: rule.periodSeconds,
          remainingSeconds: remaining,
        },
      };
    }

    return {
      passed: true,
      ruleType: 'cooldown',
      message: 'Cooldown period satisfied',
      data: {
        scope: rule.scope,
        elapsedSeconds: elapsed / 1000,
        cooldownSeconds: rule.periodSeconds,
      },
    };
  }
}
