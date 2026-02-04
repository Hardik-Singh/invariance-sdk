import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HumanApproval } from '../src/permissions/human-approval.js';
import type { ApprovalRequest } from '../src/permissions/human-approval.js';
import type { ActionInput } from '@invariance/common';

describe('HumanApproval Permission', () => {
  describe('initialization', () => {
    it('should create with action-type triggers', () => {
      const approval = new HumanApproval({
        triggers: [{ type: 'action-type', patterns: ['admin:*', 'delete:*'] }],
        timeoutSeconds: 300,
      });

      expect(approval.type).toBe('human-approval');
      expect(approval.requiresAsync).toBe(true);
      expect(approval.isActive()).toBe(true);
    });

    it('should create with amount-threshold trigger', () => {
      const approval = new HumanApproval({
        triggers: [{ type: 'amount-threshold', threshold: 1000000000000000000n }],
        timeoutSeconds: 300,
      });

      expect(approval.type).toBe('human-approval');
    });

    it('should create with always trigger', () => {
      const approval = new HumanApproval({
        triggers: [{ type: 'always' }],
        timeoutSeconds: 60,
      });

      expect(approval.type).toBe('human-approval');
    });

    it('should create with webhook channel', () => {
      const approval = new HumanApproval({
        triggers: [{ type: 'always' }],
        timeoutSeconds: 300,
        channel: 'webhook',
        webhookUrl: 'https://example.com/approve',
      });

      const permission = approval.toPermission();
      expect(permission.channel).toBe('webhook');
      expect(permission.webhookUrl).toBe('https://example.com/approve');
    });
  });

  describe('validation', () => {
    it('should throw for zero timeout', () => {
      expect(() => {
        new HumanApproval({
          triggers: [{ type: 'always' }],
          timeoutSeconds: 0,
        });
      }).toThrow('timeoutSeconds must be positive');
    });

    it('should throw for negative timeout', () => {
      expect(() => {
        new HumanApproval({
          triggers: [{ type: 'always' }],
          timeoutSeconds: -100,
        });
      }).toThrow('timeoutSeconds must be positive');
    });

    it('should throw for empty triggers', () => {
      expect(() => {
        new HumanApproval({
          triggers: [],
          timeoutSeconds: 300,
        });
      }).toThrow('At least one trigger is required');
    });

    it('should throw for webhook channel without URL', () => {
      expect(() => {
        new HumanApproval({
          triggers: [{ type: 'always' }],
          timeoutSeconds: 300,
          channel: 'webhook',
        });
      }).toThrow('webhookUrl is required for webhook channel');
    });
  });

  describe('sync check - action-type trigger', () => {
    it('should require approval for matching action patterns', () => {
      const approval = new HumanApproval({
        triggers: [{ type: 'action-type', patterns: ['admin:*', 'delete'] }],
        timeoutSeconds: 300,
      });

      expect(approval.check({ type: 'admin:users', params: {} }).allowed).toBe(false);
      expect(approval.check({ type: 'admin:settings', params: {} }).allowed).toBe(false);
      expect(approval.check({ type: 'delete', params: {} }).allowed).toBe(false);
    });

    it('should allow non-matching actions', () => {
      const approval = new HumanApproval({
        triggers: [{ type: 'action-type', patterns: ['admin:*'] }],
        timeoutSeconds: 300,
      });

      expect(approval.check({ type: 'read', params: {} }).allowed).toBe(true);
      expect(approval.check({ type: 'transfer', params: {} }).allowed).toBe(true);
    });
  });

  describe('sync check - amount-threshold trigger', () => {
    it('should require approval for amounts at or above threshold', () => {
      const approval = new HumanApproval({
        triggers: [{ type: 'amount-threshold', threshold: 1000000000000000000n }], // 1 ETH
        timeoutSeconds: 300,
      });

      // 1 ETH - at threshold
      expect(
        approval.check({ type: 'transfer', params: { amount: 1000000000000000000n } }).allowed
      ).toBe(false);

      // 2 ETH - above threshold
      expect(
        approval.check({ type: 'transfer', params: { amount: 2000000000000000000n } }).allowed
      ).toBe(false);
    });

    it('should allow amounts below threshold', () => {
      const approval = new HumanApproval({
        triggers: [{ type: 'amount-threshold', threshold: 1000000000000000000n }],
        timeoutSeconds: 300,
      });

      // 0.5 ETH - below threshold
      expect(
        approval.check({ type: 'transfer', params: { amount: 500000000000000000n } }).allowed
      ).toBe(true);
    });

    it('should allow actions without amount', () => {
      const approval = new HumanApproval({
        triggers: [{ type: 'amount-threshold', threshold: 1000000000000000000n }],
        timeoutSeconds: 300,
      });

      expect(approval.check({ type: 'read', params: {} }).allowed).toBe(true);
    });

    it('should check token-specific thresholds', () => {
      const approval = new HumanApproval({
        triggers: [
          { type: 'amount-threshold', threshold: 1000n, token: '0xUSDC' },
        ],
        timeoutSeconds: 300,
      });

      // Different token - should not trigger
      expect(
        approval.check({ type: 'transfer', params: { amount: 2000n, token: '0xUSDT' } }).allowed
      ).toBe(true);

      // Matching token - should trigger
      expect(
        approval.check({ type: 'transfer', params: { amount: 2000n, token: '0xUSDC' } }).allowed
      ).toBe(false);
    });
  });

  describe('sync check - always trigger', () => {
    it('should always require approval', () => {
      const approval = new HumanApproval({
        triggers: [{ type: 'always' }],
        timeoutSeconds: 300,
      });

      expect(approval.check({ type: 'read', params: {} }).allowed).toBe(false);
      expect(approval.check({ type: 'anything', params: {} }).allowed).toBe(false);
    });
  });

  describe('sync check - custom trigger', () => {
    it('should use registered predicate', () => {
      const approval = new HumanApproval({
        triggers: [{ type: 'custom', predicateId: 'sensitive-data' }],
        timeoutSeconds: 300,
      });

      approval.registerPredicate('sensitive-data', (action) => {
        return action.params['sensitive'] === true;
      });

      expect(approval.check({ type: 'read', params: { sensitive: true } }).allowed).toBe(false);
      expect(approval.check({ type: 'read', params: { sensitive: false } }).allowed).toBe(true);
    });

    it('should not trigger when predicate is not found', () => {
      const approval = new HumanApproval({
        triggers: [{ type: 'custom', predicateId: 'nonexistent' }],
        timeoutSeconds: 300,
      });

      // Custom triggers without registered predicate return false (no match)
      // This logs a warning but doesn't block the action
      expect(approval.check({ type: 'any', params: {} }).allowed).toBe(true);
    });
  });

  describe('async check - callback channel', () => {
    it('should approve when callback returns true', async () => {
      const approval = new HumanApproval({
        triggers: [{ type: 'always' }],
        timeoutSeconds: 300,
        channel: 'callback',
      });

      approval.onApprovalRequest(async () => true);

      const result = await approval.checkAsync({ type: 'transfer', params: {} });
      expect(result.allowed).toBe(true);
    });

    it('should reject when callback returns false', async () => {
      const approval = new HumanApproval({
        triggers: [{ type: 'always' }],
        timeoutSeconds: 300,
        channel: 'callback',
      });

      approval.onApprovalRequest(async () => false);

      const result = await approval.checkAsync({ type: 'transfer', params: {} });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('denied');
    });

    it('should fail without callback registered', async () => {
      const approval = new HumanApproval({
        triggers: [{ type: 'always' }],
        timeoutSeconds: 300,
        channel: 'callback',
      });

      await expect(
        approval.checkAsync({ type: 'transfer', params: {} })
      ).rejects.toThrow('No approval callback registered');
    });

    it('should allow when no triggers match', async () => {
      const approval = new HumanApproval({
        triggers: [{ type: 'action-type', patterns: ['admin:*'] }],
        timeoutSeconds: 300,
      });

      const result = await approval.checkAsync({ type: 'read', params: {} });
      expect(result.allowed).toBe(true);
    });

    it('should handle callback errors', async () => {
      const approval = new HumanApproval({
        triggers: [{ type: 'always' }],
        timeoutSeconds: 300,
      });

      approval.onApprovalRequest(async () => {
        throw new Error('Network error');
      });

      const result = await approval.checkAsync({ type: 'transfer', params: {} });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Network error');
    });
  });

  describe('manual approval/rejection', () => {
    it('should allow manual approval', async () => {
      const approval = new HumanApproval({
        triggers: [{ type: 'always' }],
        timeoutSeconds: 300,
        channel: 'poll',
      });

      // Create request manually and approve it
      const action: ActionInput = { type: 'transfer', params: {} };

      // Start async check in background
      const checkPromise = approval.checkAsync(action);

      // Wait a bit for request to be created
      await new Promise(resolve => setTimeout(resolve, 50));

      // Get pending requests and approve
      const pending = approval.getPendingRequests();
      expect(pending.length).toBeGreaterThan(0);

      const request = pending[0];
      if (request) {
        approval.approve(request.id);
      }

      const result = await checkPromise;
      expect(result.allowed).toBe(true);
    });

    it('should allow manual rejection with reason', async () => {
      const approval = new HumanApproval({
        triggers: [{ type: 'always' }],
        timeoutSeconds: 300,
        channel: 'poll',
      });

      const action: ActionInput = { type: 'transfer', params: {} };

      const checkPromise = approval.checkAsync(action);

      await new Promise(resolve => setTimeout(resolve, 50));

      const pending = approval.getPendingRequests();
      const request = pending[0];
      if (request) {
        approval.reject(request.id, 'Not authorized');
      }

      const result = await checkPromise;
      expect(result.allowed).toBe(false);
    });

    it('should throw when approving non-existent request', () => {
      const approval = new HumanApproval({
        triggers: [{ type: 'always' }],
        timeoutSeconds: 300,
      });

      expect(() => {
        approval.approve('nonexistent');
      }).toThrow('Request not found');
    });

    it('should throw when rejecting non-existent request', () => {
      const approval = new HumanApproval({
        triggers: [{ type: 'always' }],
        timeoutSeconds: 300,
      });

      expect(() => {
        approval.reject('nonexistent');
      }).toThrow('Request not found');
    });
  });

  describe('request management', () => {
    it('should track request status', () => {
      const approval = new HumanApproval({
        triggers: [{ type: 'always' }],
        timeoutSeconds: 300,
      });

      approval.onApprovalRequest(async () => true);

      // Trigger a request via sync check (which doesn't complete it)
      approval.check({ type: 'transfer', params: {} });

      // Pending requests should be empty since sync check doesn't create requests
      expect(approval.getPendingRequests()).toHaveLength(0);
    });

    it('should get request by ID', async () => {
      const approval = new HumanApproval({
        triggers: [{ type: 'always' }],
        timeoutSeconds: 300,
        channel: 'poll',
      });

      const checkPromise = approval.checkAsync({ type: 'transfer', params: {} });

      await new Promise(resolve => setTimeout(resolve, 50));

      const pending = approval.getPendingRequests();
      const request = pending[0];

      if (request) {
        const retrieved = approval.getRequest(request.id);
        expect(retrieved).toBeDefined();
        expect(retrieved?.action.type).toBe('transfer');

        approval.approve(request.id);
      }

      await checkPromise;
    });
  });

  describe('active state', () => {
    it('should allow all actions when inactive', () => {
      const approval = new HumanApproval({
        triggers: [{ type: 'always' }],
        timeoutSeconds: 300,
      });

      approval.setActive(false);

      const result = approval.check({ type: 'anything', params: {} });
      expect(result.allowed).toBe(true);
    });

    it('should allow async check when inactive', async () => {
      const approval = new HumanApproval({
        triggers: [{ type: 'always' }],
        timeoutSeconds: 300,
      });

      approval.setActive(false);

      const result = await approval.checkAsync({ type: 'anything', params: {} });
      expect(result.allowed).toBe(true);
    });
  });

  describe('toPermission', () => {
    it('should convert to permission config format', () => {
      const approval = new HumanApproval({
        triggers: [
          { type: 'action-type', patterns: ['admin:*'] },
          { type: 'amount-threshold', threshold: 1000n },
        ],
        timeoutSeconds: 300,
        channel: 'callback',
      });

      const permission = approval.toPermission();

      expect(permission.type).toBe('human-approval');
      expect(permission.active).toBe(true);
      expect(permission.triggers).toHaveLength(2);
      expect(permission.timeoutSeconds).toBe(300);
      expect(permission.channel).toBe('callback');
    });

    it('should include webhookUrl when set', () => {
      const approval = new HumanApproval({
        triggers: [{ type: 'always' }],
        timeoutSeconds: 300,
        channel: 'webhook',
        webhookUrl: 'https://example.com/webhook',
      });

      const permission = approval.toPermission();

      expect(permission.webhookUrl).toBe('https://example.com/webhook');
    });
  });

  describe('multiple triggers', () => {
    it('should trigger on any matching trigger', () => {
      const approval = new HumanApproval({
        triggers: [
          { type: 'action-type', patterns: ['admin:*'] },
          { type: 'amount-threshold', threshold: 1000000000000000000n },
        ],
        timeoutSeconds: 300,
      });

      // Matches action-type trigger
      expect(approval.check({ type: 'admin:delete', params: {} }).allowed).toBe(false);

      // Matches amount-threshold trigger
      expect(
        approval.check({ type: 'transfer', params: { amount: 2000000000000000000n } }).allowed
      ).toBe(false);

      // Matches neither
      expect(
        approval.check({ type: 'transfer', params: { amount: 100n } }).allowed
      ).toBe(true);
    });
  });
});
