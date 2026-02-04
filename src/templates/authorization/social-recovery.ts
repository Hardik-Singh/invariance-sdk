/**
 * Social recovery authorization checker.
 */

import type { SocialRecoveryAuthorization, VerificationContext } from '@invariance/common';
import type { AuthorizationChecker, AuthorizationCheckResult } from './checker.js';

/**
 * Proof data for social recovery verification.
 */
export interface SocialRecoveryProofData {
  /** Guardian approvals */
  approvals: Array<{
    guardian: string;
    signature: string;
    timestamp: number;
  }>;
  /** Recovery initiation timestamp */
  recoveryInitiated: number;
}

/**
 * Checks social recovery authorization.
 */
export class SocialRecoveryChecker implements AuthorizationChecker<SocialRecoveryAuthorization> {
  async check(
    rule: SocialRecoveryAuthorization,
    context: VerificationContext,
    proof?: unknown,
  ): Promise<AuthorizationCheckResult> {
    if (!proof) {
      return {
        passed: false,
        ruleType: 'social-recovery',
        message: `Social recovery requires ${rule.requiredGuardians} of ${rule.guardians.length} guardians`,
        data: {
          requiredGuardians: rule.requiredGuardians,
          totalGuardians: rule.guardians.length,
          recoveryDelay: rule.recoveryDelay,
        },
      };
    }

    const proofData = proof as SocialRecoveryProofData;

    // Check recovery delay
    const elapsed = context.timestamp - proofData.recoveryInitiated;
    const delayMs = rule.recoveryDelay * 1000;

    if (elapsed < delayMs) {
      const remaining = Math.ceil((delayMs - elapsed) / 1000);
      return {
        passed: false,
        ruleType: 'social-recovery',
        message: `Recovery delay active: ${remaining}s remaining`,
        data: {
          recoveryInitiated: proofData.recoveryInitiated,
          recoveryDelay: rule.recoveryDelay,
          remainingSeconds: remaining,
        },
      };
    }

    // Count valid guardian approvals
    const normalizedGuardians = rule.guardians.map((g) => g.toLowerCase());
    const validApprovals = new Set<string>();

    for (const approval of proofData.approvals) {
      const normalizedGuardian = approval.guardian.toLowerCase();
      if (normalizedGuardians.includes(normalizedGuardian)) {
        validApprovals.add(normalizedGuardian);
      }
    }

    const approvalCount = validApprovals.size;
    const passed = approvalCount >= rule.requiredGuardians;

    return {
      passed,
      ruleType: 'social-recovery',
      message: passed
        ? `Recovery approved: ${approvalCount}/${rule.requiredGuardians} guardians`
        : `Insufficient guardian approvals: ${approvalCount}/${rule.requiredGuardians}`,
      data: {
        approvals: approvalCount,
        requiredGuardians: rule.requiredGuardians,
        totalGuardians: rule.guardians.length,
        approvedGuardians: Array.from(validApprovals),
      },
    };
  }
}
