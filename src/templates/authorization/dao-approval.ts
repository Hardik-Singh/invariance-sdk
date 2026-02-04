/**
 * DAO approval authorization checker.
 */

import type { DAOApprovalAuthorization, VerificationContext } from '@invariance/common';
import type { AuthorizationChecker, AuthorizationCheckResult } from './checker.js';

/**
 * Proof data for DAO approval verification.
 */
export interface DAOApprovalProofData {
  /** Proposal ID */
  proposalId: string;
  /** Proposal state */
  state: 'pending' | 'active' | 'succeeded' | 'defeated' | 'queued' | 'executed' | 'expired';
  /** For votes (voting power) */
  forVotes: bigint;
  /** Against votes (voting power) */
  againstVotes: bigint;
  /** Abstain votes */
  abstainVotes?: bigint;
  /** Total voting power */
  totalVotingPower: bigint;
  /** Timelock execution time (if queued) */
  timelockEta?: number;
}

/**
 * Checks DAO approval authorization.
 */
export class DAOApprovalChecker implements AuthorizationChecker<DAOApprovalAuthorization> {
  async check(
    rule: DAOApprovalAuthorization,
    context: VerificationContext,
    proof?: unknown,
  ): Promise<AuthorizationCheckResult> {
    if (!proof) {
      return {
        passed: false,
        ruleType: 'dao-approval',
        message: 'DAO approval required - create a proposal',
        data: {
          governorContract: rule.governorContract,
          proposalThreshold: rule.proposalThreshold.toString(),
          votingPeriod: rule.votingPeriod,
          quorumPercent: rule.quorumBps / 100,
        },
      };
    }

    const proofData = proof as DAOApprovalProofData;

    // Check proposal state
    if (proofData.state === 'defeated' || proofData.state === 'expired') {
      return {
        passed: false,
        ruleType: 'dao-approval',
        message: `Proposal ${proofData.state}`,
        data: { proposalId: proofData.proposalId, state: proofData.state },
      };
    }

    // Check if executable (queued with timelock passed)
    if (proofData.state === 'queued') {
      if (proofData.timelockEta && context.timestamp >= proofData.timelockEta * 1000) {
        return {
          passed: true,
          ruleType: 'dao-approval',
          message: 'Proposal ready for execution',
          data: {
            proposalId: proofData.proposalId,
            state: proofData.state,
          },
        };
      }
      return {
        passed: false,
        ruleType: 'dao-approval',
        message: 'Proposal in timelock',
        data: {
          proposalId: proofData.proposalId,
          timelockEta: proofData.timelockEta,
        },
      };
    }

    // Check if already executed
    if (proofData.state === 'executed') {
      return {
        passed: true,
        ruleType: 'dao-approval',
        message: 'Proposal already executed',
        data: { proposalId: proofData.proposalId },
      };
    }

    // Check if succeeded (passed vote, waiting for queue)
    if (proofData.state === 'succeeded') {
      // Verify quorum
      const totalVotes = proofData.forVotes + proofData.againstVotes + (proofData.abstainVotes ?? 0n);
      const quorumBps = Number((totalVotes * 10000n) / proofData.totalVotingPower);

      if (quorumBps < rule.quorumBps) {
        return {
          passed: false,
          ruleType: 'dao-approval',
          message: `Quorum not met: ${quorumBps / 100}% < ${rule.quorumBps / 100}%`,
          data: {
            proposalId: proofData.proposalId,
            quorumPercent: quorumBps / 100,
            requiredQuorum: rule.quorumBps / 100,
          },
        };
      }

      return {
        passed: false,
        ruleType: 'dao-approval',
        message: 'Proposal succeeded - queue for timelock',
        data: {
          proposalId: proofData.proposalId,
          state: proofData.state,
          timelockDelay: rule.timelockDelay,
        },
      };
    }

    return {
      passed: false,
      ruleType: 'dao-approval',
      message: `Proposal ${proofData.state} - voting in progress`,
      data: {
        proposalId: proofData.proposalId,
        state: proofData.state,
        forVotes: proofData.forVotes.toString(),
        againstVotes: proofData.againstVotes.toString(),
      },
    };
  }
}
