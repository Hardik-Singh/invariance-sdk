import { describe, it, expect, beforeEach } from 'vitest';
import { Verifier } from '../src/core/verifier.js';
import type { PolicyConfig, SpendingCapPolicy, VotingPolicy, HumanApprovalPolicy } from '@invariance/common';

describe('Verifier', () => {
  describe('spending cap check', () => {
    it('should allow actions without amount', () => {
      const config: PolicyConfig = {
        policies: [
          {
            id: 'spending-cap-eth',
            type: 'spending-cap',
            active: true,
            maxPerTx: 1000000000000000000n,
            maxPerDay: 5000000000000000000n,
            token: '0x0000000000000000000000000000000000000000',
          },
        ],
        defaultAllow: true,
      };

      const verifier = new Verifier(config);
      const result = verifier.checkPermission({ type: 'read', params: {} });

      expect(result.allowed).toBe(true);
    });

    it('should allow amounts under per-tx limit', () => {
      const config: PolicyConfig = {
        policies: [
          {
            id: 'spending-cap-eth',
            type: 'spending-cap',
            active: true,
            maxPerTx: 1000000000000000000n, // 1 ETH
            maxPerDay: 5000000000000000000n, // 5 ETH
            token: '0x0000000000000000000000000000000000000000',
          },
        ],
        defaultAllow: true,
      };

      const verifier = new Verifier(config);
      const result = verifier.checkPermission({
        type: 'transfer',
        params: { amount: 500000000000000000n }, // 0.5 ETH
      });

      expect(result.allowed).toBe(true);
    });

    it('should deny amounts exceeding per-tx limit', () => {
      const config: PolicyConfig = {
        policies: [
          {
            id: 'spending-cap-eth',
            type: 'spending-cap',
            active: true,
            maxPerTx: 1000000000000000000n, // 1 ETH
            maxPerDay: 5000000000000000000n, // 5 ETH
            token: '0x0000000000000000000000000000000000000000',
          },
        ],
        defaultAllow: true,
      };

      const verifier = new Verifier(config);
      const result = verifier.checkPermission({
        type: 'transfer',
        params: { amount: 2000000000000000000n }, // 2 ETH
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('per-transaction limit');
    });

    it('should track daily spending', () => {
      const config: PolicyConfig = {
        policies: [
          {
            id: 'spending-cap-eth',
            type: 'spending-cap',
            active: true,
            maxPerTx: 2000000000000000000n, // 2 ETH
            maxPerDay: 3000000000000000000n, // 3 ETH
            token: '0x0000000000000000000000000000000000000000',
          },
        ],
        defaultAllow: true,
      };

      const verifier = new Verifier(config);

      // Record 2 ETH spent
      verifier.recordSpending('0x0000000000000000000000000000000000000000', 2000000000000000000n);

      // Check if we can spend 1.5 ETH more (would exceed daily limit)
      const result = verifier.checkPermission({
        type: 'transfer',
        params: { amount: 1500000000000000000n },
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('exceed limit');
    });

    it('should get daily spending', () => {
      const verifier = new Verifier();

      verifier.recordSpending('0xToken', 1000n);
      verifier.recordSpending('0xToken', 500n);

      expect(verifier.getDailySpending('0xToken')).toBe(1500n);
      expect(verifier.getDailySpending('0xOtherToken')).toBe(0n);
    });

    it('should parse amount from various field names', () => {
      const config: PolicyConfig = {
        policies: [
          {
            id: 'spending-cap-eth',
            type: 'spending-cap',
            active: true,
            maxPerTx: 100n,
            maxPerDay: 1000n,
            token: '0x0000000000000000000000000000000000000000',
          },
        ],
        defaultAllow: true,
      };

      const verifier = new Verifier(config);

      // Test 'amount' field
      expect(
        verifier.checkPermission({ type: 'tx', params: { amount: 150n } }).allowed
      ).toBe(false);

      // Test 'value' field
      expect(
        verifier.checkPermission({ type: 'tx', params: { value: 150n } }).allowed
      ).toBe(false);

      // Test 'wei' field
      expect(
        verifier.checkPermission({ type: 'tx', params: { wei: '150' } }).allowed
      ).toBe(false);

      // Test 'quantity' field
      expect(
        verifier.checkPermission({ type: 'tx', params: { quantity: 150 } }).allowed
      ).toBe(false);
    });

    it('should skip inactive permissions', () => {
      const config: PolicyConfig = {
        policies: [
          {
            id: 'spending-cap-eth',
            type: 'spending-cap',
            active: false, // Inactive
            maxPerTx: 100n,
            maxPerDay: 1000n,
            token: '0x0000000000000000000000000000000000000000',
          },
        ],
        defaultAllow: true,
      };

      const verifier = new Verifier(config);
      const result = verifier.checkPermission({
        type: 'transfer',
        params: { amount: 1000000n }, // Way over limit
      });

      expect(result.allowed).toBe(true);
    });
  });

  describe('voting permission check', () => {
    it('should deny actions requiring voting in sync check', () => {
      const config: PolicyConfig = {
        policies: [
          {
            id: 'voting-multisig',
            type: 'voting',
            active: true,
            config: {
              mode: 'multi-sig',
              requiredSignatures: 2,
              totalSigners: 3,
              signers: ['0x1', '0x2', '0x3'],
              expirationPeriod: 86400,
            },
            requiredForActions: ['transfer', 'withdraw'],
          } as VotingPolicy,
        ],
        defaultAllow: true,
      };

      const verifier = new Verifier(config);

      const result = verifier.checkPermission({ type: 'transfer', params: {} });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('voting approval');
    });

    it('should allow actions not requiring voting', () => {
      const config: PolicyConfig = {
        policies: [
          {
            id: 'voting-multisig',
            type: 'voting',
            active: true,
            config: {
              mode: 'multi-sig',
              requiredSignatures: 2,
              totalSigners: 3,
              signers: ['0x1', '0x2', '0x3'],
              expirationPeriod: 86400,
            },
            requiredForActions: ['transfer'],
          } as VotingPolicy,
        ],
        defaultAllow: true,
      };

      const verifier = new Verifier(config);

      const result = verifier.checkPermission({ type: 'read', params: {} });
      expect(result.allowed).toBe(true);
    });

    it('should require voting for all actions when requiredForActions is empty', () => {
      const config: PolicyConfig = {
        policies: [
          {
            id: 'voting-multisig',
            type: 'voting',
            active: true,
            config: {
              mode: 'multi-sig',
              requiredSignatures: 2,
              totalSigners: 3,
              signers: ['0x1', '0x2', '0x3'],
              expirationPeriod: 86400,
            },
            requiredForActions: [],
          } as VotingPolicy,
        ],
        defaultAllow: true,
      };

      const verifier = new Verifier(config);

      const result = verifier.checkPermission({ type: 'anything', params: {} });
      expect(result.allowed).toBe(false);
    });

    it('should support wildcard patterns for voting', () => {
      const config: PolicyConfig = {
        policies: [
          {
            id: 'voting-multisig',
            type: 'voting',
            active: true,
            config: {
              mode: 'multi-sig',
              requiredSignatures: 2,
              totalSigners: 3,
              signers: ['0x1', '0x2', '0x3'],
              expirationPeriod: 86400,
            },
            requiredForActions: ['admin:*'],
          } as VotingPolicy,
        ],
        defaultAllow: true,
      };

      const verifier = new Verifier(config);

      expect(verifier.checkPermission({ type: 'admin:delete', params: {} }).allowed).toBe(false);
      expect(verifier.checkPermission({ type: 'user:read', params: {} }).allowed).toBe(true);
    });
  });

  describe('human approval permission check', () => {
    it('should deny actions matching always trigger', () => {
      const config: PolicyConfig = {
        policies: [
          {
            id: 'human-approval',
            type: 'human-approval',
            active: true,
            triggers: [{ type: 'always' }],
            timeoutSeconds: 300,
            channel: 'callback',
          } as HumanApprovalPolicy,
        ],
        defaultAllow: true,
      };

      const verifier = new Verifier(config);

      const result = verifier.checkPermission({ type: 'anything', params: {} });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('human approval');
    });

    it('should deny actions matching action-type trigger', () => {
      const config: PolicyConfig = {
        policies: [
          {
            id: 'human-approval',
            type: 'human-approval',
            active: true,
            triggers: [{ type: 'action-type', patterns: ['delete:*'] }],
            timeoutSeconds: 300,
            channel: 'callback',
          } as HumanApprovalPolicy,
        ],
        defaultAllow: true,
      };

      const verifier = new Verifier(config);

      expect(verifier.checkPermission({ type: 'delete:user', params: {} }).allowed).toBe(false);
      expect(verifier.checkPermission({ type: 'read:user', params: {} }).allowed).toBe(true);
    });

    it('should deny actions matching amount-threshold trigger', () => {
      const config: PolicyConfig = {
        policies: [
          {
            id: 'human-approval',
            type: 'human-approval',
            active: true,
            triggers: [{ type: 'amount-threshold', threshold: 1000n }],
            timeoutSeconds: 300,
            channel: 'callback',
          } as HumanApprovalPolicy,
        ],
        defaultAllow: true,
      };

      const verifier = new Verifier(config);

      expect(
        verifier.checkPermission({ type: 'transfer', params: { amount: 2000n } }).allowed
      ).toBe(false);

      expect(
        verifier.checkPermission({ type: 'transfer', params: { amount: 500n } }).allowed
      ).toBe(true);
    });

    it('should check token-specific amount triggers', () => {
      const config: PolicyConfig = {
        policies: [
          {
            id: 'human-approval',
            type: 'human-approval',
            active: true,
            triggers: [{ type: 'amount-threshold', threshold: 1000n, token: '0xUSDC' }],
            timeoutSeconds: 300,
            channel: 'callback',
          } as HumanApprovalPolicy,
        ],
        defaultAllow: true,
      };

      const verifier = new Verifier(config);

      // Different token - should pass
      expect(
        verifier.checkPermission({
          type: 'transfer',
          params: { amount: 2000n, token: '0xUSDT' },
        }).allowed
      ).toBe(true);

      // Matching token - should fail
      expect(
        verifier.checkPermission({
          type: 'transfer',
          params: { amount: 2000n, token: '0xUSDC' },
        }).allowed
      ).toBe(false);
    });

    it('should trigger on custom predicates', () => {
      const config: PolicyConfig = {
        policies: [
          {
            id: 'human-approval',
            type: 'human-approval',
            active: true,
            triggers: [{ type: 'custom', predicateId: 'test' }],
            timeoutSeconds: 300,
            channel: 'callback',
          } as HumanApprovalPolicy,
        ],
        defaultAllow: true,
      };

      const verifier = new Verifier(config);

      // Custom triggers always require async flow in verifier
      const result = verifier.checkPermission({ type: 'any', params: {} });
      expect(result.allowed).toBe(false);
    });
  });

  describe('multiple permissions', () => {
    it('should check all permissions in order', () => {
      const config: PolicyConfig = {
        policies: [
          {
            id: 'spending-cap',
            type: 'spending-cap',
            active: true,
            maxPerTx: 1000n,
            maxPerDay: 5000n,
            token: '0x0',
          },
          {
            id: 'voting',
            type: 'voting',
            active: true,
            config: {
              mode: 'multi-sig',
              requiredSignatures: 2,
              totalSigners: 3,
              signers: ['0x1', '0x2', '0x3'],
              expirationPeriod: 86400,
            },
            requiredForActions: ['critical'],
          } as VotingPolicy,
        ],
        defaultAllow: true,
      };

      const verifier = new Verifier(config);

      // Should fail spending cap first
      expect(
        verifier.checkPermission({ type: 'transfer', params: { amount: 2000n } }).allowed
      ).toBe(false);

      // Should pass spending cap but fail voting
      expect(
        verifier.checkPermission({ type: 'critical', params: { amount: 500n } }).allowed
      ).toBe(false);

      // Should pass both
      expect(
        verifier.checkPermission({ type: 'regular', params: { amount: 500n } }).allowed
      ).toBe(true);
    });
  });

  describe('no config', () => {
    it('should allow all actions when no config', () => {
      const verifier = new Verifier();

      expect(verifier.checkPermission({ type: 'anything', params: {} }).allowed).toBe(true);
    });
  });
});
