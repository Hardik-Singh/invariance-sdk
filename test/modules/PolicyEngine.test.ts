import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCode } from '@invariance/common';
import { PolicyEngine } from '../../src/modules/policy/PolicyEngine.js';
import { InvarianceError } from '../../src/errors/InvarianceError.js';
import {
  createContractFactory,
  createEventEmitter,
  createTelemetry,
} from '../fixtures/mocks.js';
import type { InvarianceEventEmitter } from '../../src/core/EventEmitter.js';
import type { Telemetry } from '../../src/core/Telemetry.js';
import type { ContractFactory } from '../../src/core/ContractFactory.js';

describe('PolicyEngine', () => {
  let contracts: ContractFactory;
  let events: InvarianceEventEmitter;
  let telemetry: Telemetry;
  let policy: PolicyEngine;

  beforeEach(() => {
    contracts = createContractFactory();
    events = createEventEmitter();
    telemetry = createTelemetry();
    policy = new PolicyEngine(contracts, events, telemetry);
  });

  describe('getContractAddress()', () => {
    it('returns the policy contract address from ContractFactory', () => {
      const addr = policy.getContractAddress();
      expect(typeof addr).toBe('string');
      expect(addr).toBe(contracts.getAddress('policy'));
    });
  });

  describe('create()', () => {
    it('emits policy.created event before throwing', async () => {
      const listener = vi.fn();
      events.on('policy.created', listener);

      await expect(
        policy.create({
          name: 'Test Policy',
          actor: 'agent',
          rules: [{ type: 'max-spend', config: { limit: '100' } }],
        } as Parameters<typeof policy.create>[0]),
      ).rejects.toThrow(InvarianceError);

      // Known behavior: event emitted before throw (PR #5 fixes this)
      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith({
        policyId: 'pending',
        name: 'Test Policy',
      });
    });

    it('throws InvarianceError with POLICY_VIOLATION', async () => {
      await expect(
        policy.create({
          name: 'Test',
          actor: 'agent',
          rules: [{ type: 'max-spend', config: {} }],
        } as Parameters<typeof policy.create>[0]),
      ).rejects.toMatchObject({
        code: ErrorCode.POLICY_VIOLATION,
      });
    });

    it('tracks telemetry with rule count', async () => {
      const trackSpy = vi.spyOn(telemetry, 'track');

      await policy
        .create({
          name: 'Test',
          actor: 'agent',
          rules: [
            { type: 'max-spend', config: {} },
            { type: 'action-whitelist', config: {} },
          ],
        } as Parameters<typeof policy.create>[0])
        .catch(() => {});

      expect(trackSpy).toHaveBeenCalledWith('policy.create', {
        ruleCount: 2,
      });
    });
  });

  describe('attach()', () => {
    it('throws InvarianceError with POLICY_VIOLATION', async () => {
      await expect(
        policy.attach('policy_1', 'identity_1'),
      ).rejects.toThrow(InvarianceError);
      await expect(
        policy.attach('policy_1', 'identity_1'),
      ).rejects.toMatchObject({
        code: ErrorCode.POLICY_VIOLATION,
      });
    });
  });

  describe('evaluate()', () => {
    it('returns { allowed: false } result', async () => {
      const result = await policy.evaluate({
        policyId: 'policy_1',
        actor: { type: 'agent', address: '0x1' },
        action: 'swap',
      } as Parameters<typeof policy.evaluate>[0]);

      expect(result.allowed).toBe(false);
      expect(result.policyId).toBe('policy_1');
      expect(result.ruleResults).toEqual([]);
    });
  });

  describe('onViolation()', () => {
    it('subscribes to policy.violation events filtered by policyId', () => {
      const callback = vi.fn();
      policy.onViolation('policy_1', callback);

      events.emit('policy.violation', {
        policyId: 'policy_1',
        action: 'swap',
        detail: 'over limit',
      });

      expect(callback).toHaveBeenCalledOnce();
      expect(callback.mock.calls[0][0]).toMatchObject({
        policyId: 'policy_1',
        action: 'swap',
        detail: 'over limit',
      });
    });

    it('does not call callback for different policyId', () => {
      const callback = vi.fn();
      policy.onViolation('policy_1', callback);

      events.emit('policy.violation', {
        policyId: 'policy_2',
        action: 'swap',
        detail: 'over limit',
      });

      expect(callback).not.toHaveBeenCalled();
    });

    it('returns an unsubscribe function', () => {
      const callback = vi.fn();
      const unsub = policy.onViolation('policy_1', callback);

      expect(typeof unsub).toBe('function');

      unsub();

      events.emit('policy.violation', {
        policyId: 'policy_1',
        action: 'swap',
        detail: 'test',
      });

      expect(callback).not.toHaveBeenCalled();
    });

    it('includes timestamp in callback data', () => {
      const callback = vi.fn();
      policy.onViolation('policy_1', callback);

      const before = Date.now();
      events.emit('policy.violation', {
        policyId: 'policy_1',
        action: 'swap',
        detail: 'over limit',
      });
      const after = Date.now();

      expect(callback.mock.calls[0][0].timestamp).toBeGreaterThanOrEqual(
        before,
      );
      expect(callback.mock.calls[0][0].timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('stub methods track telemetry before throwing', () => {
    it('detach() tracks telemetry', async () => {
      const trackSpy = vi.spyOn(telemetry, 'track');
      await policy.detach('p1', 'id1').catch(() => {});
      expect(trackSpy).toHaveBeenCalledWith('policy.detach');
    });

    it('revoke() tracks telemetry', async () => {
      const trackSpy = vi.spyOn(telemetry, 'track');
      await policy.revoke('p1').catch(() => {});
      expect(trackSpy).toHaveBeenCalledWith('policy.revoke');
    });

    it('status() tracks telemetry', async () => {
      const trackSpy = vi.spyOn(telemetry, 'track');
      await policy.status('p1').catch(() => {});
      expect(trackSpy).toHaveBeenCalledWith('policy.status');
    });

    it('list() returns empty array', async () => {
      const result = await policy.list();
      expect(result).toEqual([]);
    });
  });
});
