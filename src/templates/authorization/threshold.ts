/**
 * Threshold authorization checker.
 */

import type { ThresholdAuthorization, VerificationContext } from '@invariance/common';
import type { AuthorizationChecker, AuthorizationCheckResult } from './checker.js';

/**
 * Proof data for threshold voting verification.
 */
export interface ThresholdProofData {
  /** Votes cast */
  votes: Array<{
    voter: string;
    approve: boolean;
    timestamp: number;
  }>;
  /** Voting start timestamp */
  votingStart: number;
}

/**
 * Checks threshold authorization.
 */
export class ThresholdChecker implements AuthorizationChecker<ThresholdAuthorization> {
  async check(
    rule: ThresholdAuthorization,
    context: VerificationContext,
    proof?: unknown,
  ): Promise<AuthorizationCheckResult> {
    if (!proof) {
      return {
        passed: false,
        ruleType: 'threshold',
        message: `Threshold voting required: ${rule.thresholdBps / 100}% approval needed`,
        data: {
          thresholdPercent: rule.thresholdBps / 100,
          voters: rule.voters.length,
          votingPeriod: rule.votingPeriod,
        },
      };
    }

    const proofData = proof as ThresholdProofData;

    // Check voting period
    const elapsed = context.timestamp - proofData.votingStart;
    if (elapsed > rule.votingPeriod * 1000) {
      return {
        passed: false,
        ruleType: 'threshold',
        message: 'Voting period expired',
        data: {
          elapsed: elapsed / 1000,
          votingPeriod: rule.votingPeriod,
        },
      };
    }

    // Count valid votes
    const normalizedVoters = rule.voters.map((v) => v.toLowerCase());
    const validVotes = proofData.votes.filter(
      (v) => normalizedVoters.includes(v.voter.toLowerCase()),
    );

    const approvals = validVotes.filter((v) => v.approve).length;
    const totalVotes = validVotes.length;

    // Calculate approval percentage in basis points
    const approvalBps = totalVotes > 0 ? (approvals * 10000) / rule.voters.length : 0;
    const passed = approvalBps >= rule.thresholdBps;

    return {
      passed,
      ruleType: 'threshold',
      message: passed
        ? `Threshold met: ${approvalBps / 100}% >= ${rule.thresholdBps / 100}%`
        : `Threshold not met: ${approvalBps / 100}% < ${rule.thresholdBps / 100}%`,
      data: {
        approvals,
        totalVoters: rule.voters.length,
        approvalPercent: approvalBps / 100,
        thresholdPercent: rule.thresholdBps / 100,
      },
    };
  }
}
