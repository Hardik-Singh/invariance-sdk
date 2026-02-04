import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Voting } from '../src/permissions/voting.js';
import type { Vote, Proposal } from '../src/permissions/voting.js';
import type { ActionInput } from '@invariance/common';

describe('Voting Permission', () => {
  describe('initialization', () => {
    it('should create a multi-sig voting permission', () => {
      const voting = new Voting({
        config: {
          mode: 'multi-sig',
          requiredSignatures: 2,
          totalSigners: 3,
          signers: ['0x1', '0x2', '0x3'],
          expirationPeriod: 86400,
        },
      });

      expect(voting.type).toBe('voting');
      expect(voting.requiresAsync).toBe(true);
      expect(voting.isActive()).toBe(true);
    });

    it('should create a DAO voting permission', () => {
      const voting = new Voting({
        config: {
          mode: 'dao',
          tokenAddress: '0xtoken',
          quorumBps: 4000, // 40%
          approvalThresholdBps: 5000, // 50%
          votingPeriod: 86400,
          timelockDelay: 3600,
        },
      });

      expect(voting.type).toBe('voting');
      const permission = voting.toPermission();
      expect(permission.config.mode).toBe('dao');
    });

    it('should create a threshold voting permission', () => {
      const voting = new Voting({
        config: {
          mode: 'threshold',
          thresholdBps: 6000, // 60%
          voters: ['0x1', '0x2', '0x3', '0x4', '0x5'],
          votingPeriod: 86400,
        },
      });

      expect(voting.type).toBe('voting');
      const permission = voting.toPermission();
      expect(permission.config.mode).toBe('threshold');
    });
  });

  describe('validation', () => {
    it('should throw for invalid multi-sig config', () => {
      expect(() => {
        new Voting({
          config: {
            mode: 'multi-sig',
            requiredSignatures: 0,
            totalSigners: 3,
            signers: ['0x1', '0x2', '0x3'],
            expirationPeriod: 86400,
          },
        });
      }).toThrow('requiredSignatures must be positive');

      expect(() => {
        new Voting({
          config: {
            mode: 'multi-sig',
            requiredSignatures: 5,
            totalSigners: 3,
            signers: ['0x1', '0x2', '0x3'],
            expirationPeriod: 86400,
          },
        });
      }).toThrow('requiredSignatures cannot exceed totalSigners');

      expect(() => {
        new Voting({
          config: {
            mode: 'multi-sig',
            requiredSignatures: 2,
            totalSigners: 3,
            signers: ['0x1', '0x2'], // Wrong count
            expirationPeriod: 86400,
          },
        });
      }).toThrow('signers array length must match totalSigners');

      expect(() => {
        new Voting({
          config: {
            mode: 'multi-sig',
            requiredSignatures: 2,
            totalSigners: 3,
            signers: ['0x1', '0x2', '0x3'],
            expirationPeriod: 0,
          },
        });
      }).toThrow('expirationPeriod must be positive');
    });

    it('should throw for invalid DAO config', () => {
      expect(() => {
        new Voting({
          config: {
            mode: 'dao',
            tokenAddress: '0xtoken',
            quorumBps: 15000, // Invalid > 10000
            approvalThresholdBps: 5000,
            votingPeriod: 86400,
            timelockDelay: 3600,
          },
        });
      }).toThrow('quorumBps must be between 0 and 10000');

      expect(() => {
        new Voting({
          config: {
            mode: 'dao',
            tokenAddress: '0xtoken',
            quorumBps: 4000,
            approvalThresholdBps: -100,
            votingPeriod: 86400,
            timelockDelay: 3600,
          },
        });
      }).toThrow('approvalThresholdBps must be between 0 and 10000');
    });

    it('should throw for invalid threshold config', () => {
      expect(() => {
        new Voting({
          config: {
            mode: 'threshold',
            thresholdBps: 6000,
            voters: [], // Empty
            votingPeriod: 86400,
          },
        });
      }).toThrow('voters array cannot be empty');
    });
  });

  describe('sync check', () => {
    it('should deny actions that require voting in sync mode', () => {
      const voting = new Voting({
        config: {
          mode: 'multi-sig',
          requiredSignatures: 2,
          totalSigners: 3,
          signers: ['0x1', '0x2', '0x3'],
          expirationPeriod: 86400,
        },
        requiredForActions: ['transfer', 'withdraw'],
      });

      const result = voting.check({ type: 'transfer', params: {} });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Use checkAsync');
    });

    it('should allow actions not requiring voting', () => {
      const voting = new Voting({
        config: {
          mode: 'multi-sig',
          requiredSignatures: 2,
          totalSigners: 3,
          signers: ['0x1', '0x2', '0x3'],
          expirationPeriod: 86400,
        },
        requiredForActions: ['transfer', 'withdraw'],
      });

      const result = voting.check({ type: 'read', params: {} });
      expect(result.allowed).toBe(true);
    });

    it('should require voting for all actions when requiredForActions is empty', () => {
      const voting = new Voting({
        config: {
          mode: 'multi-sig',
          requiredSignatures: 2,
          totalSigners: 3,
          signers: ['0x1', '0x2', '0x3'],
          expirationPeriod: 86400,
        },
        requiredForActions: [],
      });

      const result = voting.check({ type: 'anything', params: {} });
      expect(result.allowed).toBe(false);
    });

    it('should support wildcard action patterns', () => {
      const voting = new Voting({
        config: {
          mode: 'multi-sig',
          requiredSignatures: 2,
          totalSigners: 3,
          signers: ['0x1', '0x2', '0x3'],
          expirationPeriod: 86400,
        },
        requiredForActions: ['admin:*'],
      });

      expect(voting.check({ type: 'admin:delete', params: {} }).allowed).toBe(false);
      expect(voting.check({ type: 'admin:update', params: {} }).allowed).toBe(false);
      expect(voting.check({ type: 'user:read', params: {} }).allowed).toBe(true);
    });
  });

  describe('async check - multi-sig', () => {
    it('should approve when enough signatures are collected', async () => {
      const voting = new Voting({
        config: {
          mode: 'multi-sig',
          requiredSignatures: 2,
          totalSigners: 3,
          signers: ['0x1', '0x2', '0x3'],
          expirationPeriod: 86400,
        },
      });

      voting.onVoteRequest(async (proposal: Proposal): Promise<Vote[]> => {
        return [
          { voter: '0x1', approved: true, timestamp: Date.now() },
          { voter: '0x2', approved: true, timestamp: Date.now() },
        ];
      });

      const result = await voting.checkAsync({ type: 'transfer', params: {} });
      expect(result.allowed).toBe(true);
    });

    it('should reject when not enough signatures', async () => {
      const voting = new Voting({
        config: {
          mode: 'multi-sig',
          requiredSignatures: 2,
          totalSigners: 3,
          signers: ['0x1', '0x2', '0x3'],
          expirationPeriod: 86400,
        },
      });

      voting.onVoteRequest(async (): Promise<Vote[]> => {
        return [
          { voter: '0x1', approved: true, timestamp: Date.now() },
        ];
      });

      const result = await voting.checkAsync({ type: 'transfer', params: {} });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('consensus');
    });

    it('should fail without callback registered', async () => {
      const voting = new Voting({
        config: {
          mode: 'multi-sig',
          requiredSignatures: 2,
          totalSigners: 3,
          signers: ['0x1', '0x2', '0x3'],
          expirationPeriod: 86400,
        },
      });

      const result = await voting.checkAsync({ type: 'transfer', params: {} });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('No vote request callback');
    });

    it('should reject votes from non-signers', async () => {
      const voting = new Voting({
        config: {
          mode: 'multi-sig',
          requiredSignatures: 2,
          totalSigners: 3,
          signers: ['0x1', '0x2', '0x3'],
          expirationPeriod: 86400,
        },
      });

      voting.onVoteRequest(async (): Promise<Vote[]> => {
        return [
          { voter: '0x1', approved: true, timestamp: Date.now() },
          { voter: '0xInvalid', approved: true, timestamp: Date.now() }, // Invalid signer
        ];
      });

      const result = await voting.checkAsync({ type: 'transfer', params: {} });
      expect(result.allowed).toBe(false);
    });
  });

  describe('async check - threshold', () => {
    it('should approve when threshold is met', async () => {
      const voting = new Voting({
        config: {
          mode: 'threshold',
          thresholdBps: 5000, // 50%
          voters: ['0x1', '0x2', '0x3', '0x4'],
          votingPeriod: 86400,
        },
      });

      voting.onVoteRequest(async (): Promise<Vote[]> => {
        return [
          { voter: '0x1', approved: true, timestamp: Date.now() },
          { voter: '0x2', approved: true, timestamp: Date.now() },
          { voter: '0x3', approved: false, timestamp: Date.now() },
        ];
      });

      const result = await voting.checkAsync({ type: 'transfer', params: {} });
      expect(result.allowed).toBe(true);
    });

    it('should reject when threshold is not met', async () => {
      const voting = new Voting({
        config: {
          mode: 'threshold',
          thresholdBps: 7500, // 75%
          voters: ['0x1', '0x2', '0x3', '0x4'],
          votingPeriod: 86400,
        },
      });

      voting.onVoteRequest(async (): Promise<Vote[]> => {
        return [
          { voter: '0x1', approved: true, timestamp: Date.now() },
          { voter: '0x2', approved: true, timestamp: Date.now() },
          { voter: '0x3', approved: false, timestamp: Date.now() },
          { voter: '0x4', approved: false, timestamp: Date.now() },
        ];
      });

      const result = await voting.checkAsync({ type: 'transfer', params: {} });
      expect(result.allowed).toBe(false);
    });
  });

  describe('proposal management', () => {
    it('should create proposals', () => {
      const voting = new Voting({
        config: {
          mode: 'multi-sig',
          requiredSignatures: 2,
          totalSigners: 3,
          signers: ['0x1', '0x2', '0x3'],
          expirationPeriod: 86400,
        },
      });

      const action: ActionInput = { type: 'transfer', params: { amount: '100' } };
      const proposal = voting.createProposal(action);

      expect(proposal.id).toBeDefined();
      expect(proposal.action).toEqual(action);
      expect(proposal.status).toBe('pending');
      expect(proposal.votes).toHaveLength(0);
    });

    it('should record votes', () => {
      const voting = new Voting({
        config: {
          mode: 'multi-sig',
          requiredSignatures: 2,
          totalSigners: 3,
          signers: ['0x1', '0x2', '0x3'],
          expirationPeriod: 86400,
        },
      });

      const proposal = voting.createProposal({ type: 'transfer', params: {} });

      voting.recordVotes(proposal.id, [
        { voter: '0x1', approved: true, timestamp: Date.now() },
        { voter: '0x2', approved: true, timestamp: Date.now() },
      ]);

      expect(voting.isProposalApproved(proposal.id)).toBe(true);
    });

    it('should prevent duplicate votes', () => {
      const voting = new Voting({
        config: {
          mode: 'multi-sig',
          requiredSignatures: 2,
          totalSigners: 3,
          signers: ['0x1', '0x2', '0x3'],
          expirationPeriod: 86400,
        },
      });

      const proposal = voting.createProposal({ type: 'transfer', params: {} });

      voting.recordVotes(proposal.id, [
        { voter: '0x1', approved: true, timestamp: Date.now() },
      ]);

      voting.recordVotes(proposal.id, [
        { voter: '0x1', approved: false, timestamp: Date.now() }, // Duplicate
        { voter: '0x2', approved: true, timestamp: Date.now() },
      ]);

      const storedProposal = voting.getProposal(proposal.id);
      expect(storedProposal?.votes).toHaveLength(2);
      // First vote should be kept (approved: true)
      expect(storedProposal?.votes[0]?.approved).toBe(true);
    });
  });

  describe('active state', () => {
    it('should allow all actions when inactive', () => {
      const voting = new Voting({
        config: {
          mode: 'multi-sig',
          requiredSignatures: 2,
          totalSigners: 3,
          signers: ['0x1', '0x2', '0x3'],
          expirationPeriod: 86400,
        },
      });

      voting.setActive(false);

      const result = voting.check({ type: 'transfer', params: {} });
      expect(result.allowed).toBe(true);
    });

    it('should allow async check when inactive', async () => {
      const voting = new Voting({
        config: {
          mode: 'multi-sig',
          requiredSignatures: 2,
          totalSigners: 3,
          signers: ['0x1', '0x2', '0x3'],
          expirationPeriod: 86400,
        },
      });

      voting.setActive(false);

      const result = await voting.checkAsync({ type: 'transfer', params: {} });
      expect(result.allowed).toBe(true);
    });
  });

  describe('toPermission', () => {
    it('should convert to permission config format', () => {
      const voting = new Voting({
        config: {
          mode: 'multi-sig',
          requiredSignatures: 2,
          totalSigners: 3,
          signers: ['0x1', '0x2', '0x3'],
          expirationPeriod: 86400,
        },
        requiredForActions: ['transfer'],
      });

      const permission = voting.toPermission();

      expect(permission.type).toBe('voting');
      expect(permission.active).toBe(true);
      expect(permission.config.mode).toBe('multi-sig');
      expect(permission.requiredForActions).toEqual(['transfer']);
    });
  });
});
