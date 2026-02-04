/**
 * Blacklist authorization checker.
 */

import type { BlacklistAuthorization, VerificationContext } from '@invariance/common';
import type { AuthorizationChecker, AuthorizationCheckResult } from './checker.js';

/**
 * Checks blacklist authorization.
 */
export class BlacklistChecker implements AuthorizationChecker<BlacklistAuthorization> {
  async check(
    rule: BlacklistAuthorization,
    context: VerificationContext,
    _proof?: unknown,
  ): Promise<AuthorizationCheckResult> {
    const sender = context.sender.toLowerCase();

    // Check direct address list
    if (rule.addresses && rule.addresses.length > 0) {
      const normalizedAddresses = rule.addresses.map((a) => a.toLowerCase());
      const isBlacklisted = normalizedAddresses.includes(sender);

      if (isBlacklisted) {
        return {
          passed: false,
          ruleType: 'blacklist',
          message: 'Address is blacklisted',
          data: { address: context.sender },
        };
      }
    }

    // If using on-chain blacklist, would check contract here
    if (rule.onChain && rule.blacklistContract) {
      // In production, call the blacklist contract
      // const isBlacklisted = await contract.isBlacklisted(sender);
    }

    return {
      passed: true,
      ruleType: 'blacklist',
      message: 'Address not blacklisted',
      data: { address: context.sender },
    };
  }
}
