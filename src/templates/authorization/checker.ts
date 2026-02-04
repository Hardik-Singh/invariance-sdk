/**
 * Authorization checker dispatcher.
 */

import type { AuthorizationRule, VerificationContext } from '@invariance/common';
import { SignatureChecker } from './signature.js';
import { MultiSigChecker } from './multi-sig.js';
import { WhitelistChecker } from './whitelist.js';
import { BlacklistChecker } from './blacklist.js';
import { TokenGatedChecker } from './token-gated.js';
import { NFTGatedChecker } from './nft-gated.js';
import { ThresholdChecker } from './threshold.js';
import { RoleBasedChecker } from './role-based.js';
import { DAOApprovalChecker } from './dao-approval.js';
import { TimeLockedChecker } from './time-locked.js';
import { SocialRecoveryChecker } from './social-recovery.js';

/**
 * Result of an authorization check.
 */
export interface AuthorizationCheckResult {
  /** Whether authorization passed */
  passed: boolean;
  /** Rule type that was checked */
  ruleType: string;
  /** Message describing the result */
  message?: string;
  /** Additional data */
  data?: Record<string, unknown>;
}

/**
 * Interface for authorization checker implementations.
 */
export interface AuthorizationChecker<T extends AuthorizationRule = AuthorizationRule> {
  /**
   * Check if authorization is satisfied.
   *
   * @param rule - The authorization rule to check
   * @param context - The verification context
   * @param proof - Optional proof data (signatures, etc.)
   * @returns The check result
   */
  check(rule: T, context: VerificationContext, proof?: unknown): Promise<AuthorizationCheckResult>;
}

/**
 * Check an authorization rule against context.
 *
 * @param rule - The authorization rule to check
 * @param context - The verification context
 * @param proof - Optional proof data
 * @returns The check result
 */
export async function checkAuthorization(
  rule: AuthorizationRule,
  context: VerificationContext,
  proof?: unknown,
): Promise<AuthorizationCheckResult> {
  switch (rule.type) {
    case 'signature': {
      const checker = new SignatureChecker();
      return checker.check(rule, context, proof);
    }
    case 'multi-sig': {
      const checker = new MultiSigChecker();
      return checker.check(rule, context, proof);
    }
    case 'whitelist': {
      const checker = new WhitelistChecker();
      return checker.check(rule, context, proof);
    }
    case 'blacklist': {
      const checker = new BlacklistChecker();
      return checker.check(rule, context, proof);
    }
    case 'token-gated': {
      const checker = new TokenGatedChecker();
      return checker.check(rule, context, proof);
    }
    case 'nft-gated': {
      const checker = new NFTGatedChecker();
      return checker.check(rule, context, proof);
    }
    case 'threshold': {
      const checker = new ThresholdChecker();
      return checker.check(rule, context, proof);
    }
    case 'role-based': {
      const checker = new RoleBasedChecker();
      return checker.check(rule, context, proof);
    }
    case 'dao-approval': {
      const checker = new DAOApprovalChecker();
      return checker.check(rule, context, proof);
    }
    case 'time-locked': {
      const checker = new TimeLockedChecker();
      return checker.check(rule, context, proof);
    }
    case 'social-recovery': {
      const checker = new SocialRecoveryChecker();
      return checker.check(rule, context, proof);
    }
    default: {
      return {
        passed: false,
        ruleType: 'unknown',
        message: `Unknown authorization type: ${(rule as AuthorizationRule).type}`,
      };
    }
  }
}
