import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ErrorCode } from '@invariance/common';
import { PolicyEngine } from '../../src/modules/policy/PolicyEngine.js';
import { InvarianceError } from '../../src/errors/InvarianceError.js';
import {
  createMockContractFactory,
  createMockContract,
  createMockPublicClient,
  createEventEmitter,
  createTelemetry,
} from '../fixtures/mocks.js';
import type { InvarianceEventEmitter } from '../../src/core/EventEmitter.js';
import type { Telemetry } from '../../src/core/Telemetry.js';
import type { ContractFactory } from '../../src/core/ContractFactory.js';
import type { OnChainPolicy, OnChainPolicyRule } from '../../src/modules/policy/types.js';

const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as const;

describe('PolicyEngine', () => {
  let contracts: ContractFactory;
  let events: InvarianceEventEmitter;
  let telemetry: Telemetry;
  let policy: PolicyEngine;

  beforeEach(() => {
    events = createEventEmitter();
    telemetry = createTelemetry();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('getContractAddress()', () => {
    it('returns the policy contract address from ContractFactory', () => {
      contracts = createMockContractFactory();
      policy = new PolicyEngine(contracts, events, telemetry);

      const addr = policy.getContractAddress();
      expect(typeof addr).toBe('string');
      expect(addr).toBe(contracts.getAddress('policy'));
    });
  });

  describe('create()', () => {
    it('creates a policy on-chain and returns it', async () => {
      const mockPolicyId = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as `0x${string}`;
      const mockOnChainPolicy: OnChainPolicy = {
        policyId: mockPolicyId,
        name: 'Test Policy',
        creator: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
        applicableActorTypes: [0],
        state: 0,
        createdAt: 1234567890n,
        expiresAt: 0n,
      };
      const mockRules: OnChainPolicyRule[] = [
        {
          ruleType: 0,
          config: '0x' as `0x${string}`,
        },
      ];

      contracts = createMockContractFactory({
        contract: createMockContract({
          write: {
            create: vi.fn().mockResolvedValue('0xtxhash'),
          },
          read: {
            getPolicy: vi.fn().mockResolvedValue(mockOnChainPolicy),
            getRules: vi.fn().mockResolvedValue(mockRules),
          },
        }),
        publicClient: createMockPublicClient(),
      });
      policy = new PolicyEngine(contracts, events, telemetry);

      const listener = vi.fn();
      events.on('policy.created', listener);

      const result = await policy.create({
        name: 'Test Policy',
        actor: 'agent',
        rules: [{ type: 'max-spend', config: { limit: '100' } }],
      });

      expect(result.policyId).toBeTruthy();
      expect(result.name).toBe('Test Policy');
      expect(result.state).toBe('active');
      expect(listener).toHaveBeenCalledOnce();
      expect(contracts.getContract('policy').write.create).toHaveBeenCalled();
    });

    it('emits policy.created event after successful transaction', async () => {
      const mockPolicyId = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as `0x${string}`;
      const mockOnChainPolicy: OnChainPolicy = {
        policyId: mockPolicyId,
        name: 'Test Policy',
        creator: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
        applicableActorTypes: [0],
        state: 0,
        createdAt: 1234567890n,
        expiresAt: 0n,
      };
      const mockRules: OnChainPolicyRule[] = [];

      contracts = createMockContractFactory({
        contract: createMockContract({
          write: {
            create: vi.fn().mockResolvedValue('0xtxhash'),
          },
          read: {
            getPolicy: vi.fn().mockResolvedValue(mockOnChainPolicy),
            getRules: vi.fn().mockResolvedValue(mockRules),
          },
        }),
        publicClient: createMockPublicClient(),
      });
      policy = new PolicyEngine(contracts, events, telemetry);

      const listener = vi.fn();
      events.on('policy.created', listener);

      await policy.create({
        name: 'Test Policy',
        actor: 'agent',
        rules: [{ type: 'max-spend', config: {} }],
      });

      expect(listener).toHaveBeenCalledOnce();
      expect(listener.mock.calls[0][0]).toMatchObject({
        name: 'Test Policy',
      });
    });

    it('tracks telemetry with rule count', async () => {
      const mockPolicyId = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as `0x${string}`;
      const mockOnChainPolicy: OnChainPolicy = {
        policyId: mockPolicyId,
        name: 'Test',
        creator: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
        applicableActorTypes: [0],
        state: 0,
        createdAt: 1234567890n,
        expiresAt: 0n,
      };

      const mockContract = createMockContract({
        write: {
          create: vi.fn().mockResolvedValue('0xtxhash'),
        },
        read: {
          getPolicy: vi.fn().mockResolvedValue(mockOnChainPolicy),
          getRules: vi.fn().mockResolvedValue([]),
        },
      });
      const mockPublicClient = createMockPublicClient();
      contracts = createMockContractFactory({
        contract: mockContract,
        publicClient: mockPublicClient,
      });
      policy = new PolicyEngine(contracts, events, telemetry);

      const trackSpy = vi.spyOn(telemetry, 'track');

      await policy.create({
        name: 'Test',
        actor: 'agent',
        rules: [
          { type: 'max-spend', config: {} },
          { type: 'action-whitelist', config: {} },
        ],
      });

      expect(trackSpy).toHaveBeenCalledWith('policy.create', {
        ruleCount: 2,
      });
    });

    it('handles multiple actor types', async () => {
      const mockPolicyId = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as `0x${string}`;
      const mockOnChainPolicy: OnChainPolicy = {
        policyId: mockPolicyId,
        name: 'Multi-Actor Policy',
        creator: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
        applicableActorTypes: [0, 1],
        state: 0,
        createdAt: 1234567890n,
        expiresAt: 0n,
      };

      const mockContract = createMockContract({
        write: {
          create: vi.fn().mockResolvedValue('0xtxhash'),
        },
        read: {
          getPolicy: vi.fn().mockResolvedValue(mockOnChainPolicy),
          getRules: vi.fn().mockResolvedValue([]),
        },
      });
      const mockPublicClient = createMockPublicClient();
      contracts = createMockContractFactory({
        contract: mockContract,
        publicClient: mockPublicClient,
      });
      policy = new PolicyEngine(contracts, events, telemetry);

      const result = await policy.create({
        name: 'Multi-Actor Policy',
        actor: ['agent', 'human'],
        rules: [{ type: 'max-spend', config: {} }],
      });

      expect(Array.isArray(result.actor)).toBe(true);
      expect(contracts.getContract('policy').write.create).toHaveBeenCalled();
    });

    it('throws InvarianceError on contract error', async () => {
      const mockContract = createMockContract({
        write: {
          create: vi.fn().mockRejectedValue(new Error('Contract error')),
        },
      });
      const mockPublicClient = createMockPublicClient();
      contracts = createMockContractFactory({
        contract: mockContract,
        publicClient: mockPublicClient,
      });
      policy = new PolicyEngine(contracts, events, telemetry);

      await expect(
        policy.create({
          name: 'Test',
          actor: 'agent',
          rules: [{ type: 'max-spend', config: {} }],
        }),
      ).rejects.toThrow(InvarianceError);
    });
  });

  describe('attach()', () => {
    it('attaches a policy to an identity', async () => {
      const mockContract = createMockContract({
        write: {
          attach: vi.fn().mockResolvedValue('0xtxhash'),
        },
      });
      const mockPublicClient = createMockPublicClient();
      contracts = createMockContractFactory({
        contract: mockContract,
        publicClient: mockPublicClient,
      });
      policy = new PolicyEngine(contracts, events, telemetry);

      const listener = vi.fn();
      events.on('policy.attached', listener);

      const result = await policy.attach('policy_1', 'identity_1');

      expect(result.txHash).toBe('0xabc123');
      expect(result.status).toBe('success');
      expect(contracts.getContract('policy').write.attach).toHaveBeenCalled();
    });

    // TODO: Re-enable when policy.attached event is added to InvarianceEvents type
    // it('emits policy.attached event after successful transaction', async () => {
    //   const mockContract = createMockContract({
    //     write: {
    //       attach: vi.fn().mockResolvedValue('0xtxhash'),
    //     },
    //   });
    //   const mockPublicClient = createMockPublicClient();
    //   contracts = createMockContractFactory({
    //     contract: mockContract,
    //     publicClient: mockPublicClient,
    //   });
    //   policy = new PolicyEngine(contracts, events, telemetry);

    //   const listener = vi.fn();
    //   events.on('policy.attached', listener);

    //   await policy.attach('policy_1', 'identity_1');

    //   expect(listener).toHaveBeenCalledWith({
    //     policyId: 'policy_1',
    //     identityId: 'identity_1',
    //   });
    // });

    it('throws InvarianceError on contract error', async () => {
      const mockContract = createMockContract({
        write: {
          attach: vi.fn().mockRejectedValue({
            name: 'ContractFunctionRevertedError',
            data: { errorName: 'PolicyAlreadyAttached' },
            message: 'Policy already attached',
          }),
        },
      });
      const mockPublicClient = createMockPublicClient();
      contracts = createMockContractFactory({
        contract: mockContract,
        publicClient: mockPublicClient,
      });
      policy = new PolicyEngine(contracts, events, telemetry);

      await expect(
        policy.attach('policy_1', 'identity_1'),
      ).rejects.toMatchObject({
        code: ErrorCode.POLICY_VIOLATION,
      });
    });
  });

  describe('detach()', () => {
    it('detaches a policy from an identity', async () => {
      const mockContract = createMockContract({
        write: {
          detach: vi.fn().mockResolvedValue('0xtxhash'),
        },
      });
      const mockPublicClient = createMockPublicClient();
      contracts = createMockContractFactory({
        contract: mockContract,
        publicClient: mockPublicClient,
      });
      policy = new PolicyEngine(contracts, events, telemetry);

      const listener = vi.fn();
      events.on('policy.detached', listener);

      const result = await policy.detach('policy_1', 'identity_1');

      expect(result.txHash).toBe('0xabc123');
      expect(result.status).toBe('success');
      expect(contracts.getContract('policy').write.detach).toHaveBeenCalled();
    });

    it('tracks telemetry', async () => {
      const mockContract = createMockContract({
        write: {
          detach: vi.fn().mockResolvedValue('0xtxhash'),
        },
      });
      const mockPublicClient = createMockPublicClient();
      contracts = createMockContractFactory({
        contract: mockContract,
        publicClient: mockPublicClient,
      });
      policy = new PolicyEngine(contracts, events, telemetry);

      const trackSpy = vi.spyOn(telemetry, 'track');

      await policy.detach('p1', 'id1');

      expect(trackSpy).toHaveBeenCalledWith('policy.detach');
    });

    it('throws InvarianceError on contract error', async () => {
      const mockContract = createMockContract({
        write: {
          detach: vi.fn().mockRejectedValue({
            name: 'ContractFunctionRevertedError',
            data: { errorName: 'PolicyNotAttached' },
            message: 'Policy not attached',
          }),
        },
      });
      const mockPublicClient = createMockPublicClient();
      contracts = createMockContractFactory({
        contract: mockContract,
        publicClient: mockPublicClient,
      });
      policy = new PolicyEngine(contracts, events, telemetry);

      await expect(
        policy.detach('policy_1', 'identity_1'),
      ).rejects.toMatchObject({
        code: ErrorCode.POLICY_VIOLATION,
      });
    });
  });

  describe('status()', () => {
    it('returns policy status with usage metrics', async () => {
      const mockPolicyId = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as `0x${string}`;
      const mockOnChainPolicy: OnChainPolicy = {
        policyId: mockPolicyId,
        name: 'Test Policy',
        creator: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
        applicableActorTypes: [0],
        state: 0,
        createdAt: 1234567890n,
        expiresAt: 1234567900n,
      };
      const mockRules: OnChainPolicyRule[] = [
        {
          ruleType: 0,
          config: '0x' as `0x${string}`,
        },
      ];

      const mockContract = createMockContract({
        read: {
          getPolicy: vi.fn().mockResolvedValue(mockOnChainPolicy),
          getRules: vi.fn().mockResolvedValue(mockRules),
        },
      });
      contracts = createMockContractFactory({
        contract: mockContract,
      });
      policy = new PolicyEngine(contracts, events, telemetry);

      const result = await policy.status('policy_1');

      expect(result.policyId).toBeTruthy();
      expect(result.name).toBe('Test Policy');
      expect(result.state).toBe('active');
      expect(result.usage).toBeDefined();
      expect(result.usage.totalEvaluations).toBe(0);
      expect(result.usage.violations).toBe(0);
      expect(result.expiresAt).toBe(1234567900);
    });

    it('tracks telemetry', async () => {
      const mockPolicyId = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as `0x${string}`;
      const mockOnChainPolicy: OnChainPolicy = {
        policyId: mockPolicyId,
        name: 'Test',
        creator: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
        applicableActorTypes: [],
        state: 0,
        createdAt: 1234567890n,
        expiresAt: 0n,
      };

      const mockContract = createMockContract({
        read: {
          getPolicy: vi.fn().mockResolvedValue(mockOnChainPolicy),
          getRules: vi.fn().mockResolvedValue([]),
        },
      });
      contracts = createMockContractFactory({
        contract: mockContract,
      });
      policy = new PolicyEngine(contracts, events, telemetry);

      const trackSpy = vi.spyOn(telemetry, 'track');

      await policy.status('p1');

      expect(trackSpy).toHaveBeenCalledWith('policy.status');
    });

    it('throws InvarianceError when policy not found', async () => {
      const mockOnChainPolicy: OnChainPolicy = {
        policyId: ZERO_BYTES32,
        name: '',
        creator: '0x0000000000000000000000000000000000000000' as `0x${string}`,
        applicableActorTypes: [],
        state: 0,
        createdAt: 0n,
        expiresAt: 0n,
      };

      const mockContract = createMockContract({
        read: {
          getPolicy: vi.fn().mockResolvedValue(mockOnChainPolicy),
        },
      });
      contracts = createMockContractFactory({
        contract: mockContract,
      });
      policy = new PolicyEngine(contracts, events, telemetry);

      await expect(policy.status('nonexistent')).rejects.toMatchObject({
        code: ErrorCode.POLICY_VIOLATION,
        message: expect.stringContaining('Policy not found'),
      });
    });
  });

  describe('list()', () => {
    it('returns empty array when indexer unavailable', async () => {
      const mockContract = createMockContract({
        read: {
          policyCount: vi.fn().mockResolvedValue(0n),
        },
      });
      contracts = createMockContractFactory({
        contract: mockContract,
      });
      policy = new PolicyEngine(contracts, events, telemetry);

      const result = await policy.list();

      expect(result).toEqual([]);
    });

    it('tracks telemetry with filters', async () => {
      const mockContract = createMockContract({
        read: {
          policyCount: vi.fn().mockResolvedValue(0n),
        },
      });
      contracts = createMockContractFactory({
        contract: mockContract,
      });
      policy = new PolicyEngine(contracts, events, telemetry);

      const trackSpy = vi.spyOn(telemetry, 'track');

      await policy.list({ identityId: 'id1' });

      expect(trackSpy).toHaveBeenCalledWith('policy.list', {
        hasFilters: true,
      });
    });
  });

  describe('evaluate()', () => {
    it('returns evaluation result', async () => {
      const mockContract = createMockContract({
        read: {
          evaluate: vi.fn().mockResolvedValue([false, '0x']),
        },
      });
      contracts = createMockContractFactory({
        contract: mockContract,
      });
      policy = new PolicyEngine(contracts, events, telemetry);

      const result = await policy.evaluate({
        policyId: 'policy_1',
        actor: { type: 'agent', address: '0x1' },
        action: 'swap',
      });

      expect(result.allowed).toBe(false);
      expect(result.policyId).toBe('policy_1');
      expect(result.ruleResults).toEqual([]);
      expect(mockContract.read.evaluate).toHaveBeenCalled();
    });

    it('handles allowed actions', async () => {
      const mockContract = createMockContract({
        read: {
          evaluate: vi.fn().mockResolvedValue([true, '0x']),
        },
      });
      contracts = createMockContractFactory({
        contract: mockContract,
      });
      policy = new PolicyEngine(contracts, events, telemetry);

      const result = await policy.evaluate({
        policyId: 'policy_1',
        actor: { type: 'agent', address: '0x1' },
        action: 'swap',
      });

      expect(result.allowed).toBe(true);
    });

    it('tracks telemetry', async () => {
      const mockContract = createMockContract({
        read: {
          evaluate: vi.fn().mockResolvedValue([false, '0x']),
        },
      });
      contracts = createMockContractFactory({
        contract: mockContract,
      });
      policy = new PolicyEngine(contracts, events, telemetry);

      const trackSpy = vi.spyOn(telemetry, 'track');

      await policy.evaluate({
        policyId: 'policy_1',
        actor: { type: 'agent', address: '0x1' },
        action: 'swap',
      });

      expect(trackSpy).toHaveBeenCalledWith('policy.evaluate');
    });
  });

  describe('revoke()', () => {
    it('revokes a policy', async () => {
      const mockContract = createMockContract({
        write: {
          revoke: vi.fn().mockResolvedValue('0xtxhash'),
        },
      });
      const mockPublicClient = createMockPublicClient();
      contracts = createMockContractFactory({
        contract: mockContract,
        publicClient: mockPublicClient,
      });
      policy = new PolicyEngine(contracts, events, telemetry);

      const listener = vi.fn();
      events.on('policy.revoked', listener);

      const result = await policy.revoke('policy_1');

      expect(result.txHash).toBe('0xabc123');
      expect(result.status).toBe('success');
      expect(contracts.getContract('policy').write.revoke).toHaveBeenCalled();
    });

    it('tracks telemetry', async () => {
      const mockContract = createMockContract({
        write: {
          revoke: vi.fn().mockResolvedValue('0xtxhash'),
        },
      });
      const mockPublicClient = createMockPublicClient();
      contracts = createMockContractFactory({
        contract: mockContract,
        publicClient: mockPublicClient,
      });
      policy = new PolicyEngine(contracts, events, telemetry);

      const trackSpy = vi.spyOn(telemetry, 'track');

      await policy.revoke('p1');

      expect(trackSpy).toHaveBeenCalledWith('policy.revoke');
    });

    it('throws InvarianceError on contract error', async () => {
      const mockContract = createMockContract({
        write: {
          revoke: vi.fn().mockRejectedValue({
            name: 'ContractFunctionRevertedError',
            data: { errorName: 'NotPolicyCreator' },
            message: 'Not policy creator',
          }),
        },
      });
      const mockPublicClient = createMockPublicClient();
      contracts = createMockContractFactory({
        contract: mockContract,
        publicClient: mockPublicClient,
      });
      policy = new PolicyEngine(contracts, events, telemetry);

      await expect(policy.revoke('policy_1')).rejects.toMatchObject({
        code: ErrorCode.NOT_AUTHORIZED_SIGNER,
      });
    });
  });

  describe('compose()', () => {
    it('composes multiple policies into one', async () => {
      const mockPolicyId = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as `0x${string}`;
      const mockOnChainPolicy: OnChainPolicy = {
        policyId: mockPolicyId,
        name: 'Composite Policy (2 policies)',
        creator: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
        applicableActorTypes: [0],
        state: 0,
        createdAt: 1234567890n,
        expiresAt: 0n,
      };

      const mockContract = createMockContract({
        write: {
          compose: vi.fn().mockResolvedValue('0xtxhash'),
        },
        read: {
          getPolicy: vi.fn().mockResolvedValue(mockOnChainPolicy),
          getRules: vi.fn().mockResolvedValue([]),
        },
      });
      const mockPublicClient = createMockPublicClient();
      contracts = createMockContractFactory({
        contract: mockContract,
        publicClient: mockPublicClient,
      });
      policy = new PolicyEngine(contracts, events, telemetry);

      const listener = vi.fn();
      events.on('policy.composed', listener);

      const result = await policy.compose(['policy_1', 'policy_2']);

      expect(result.policyId).toBeTruthy();
      expect(result.name).toContain('Composite');
      expect(contracts.getContract('policy').write.compose).toHaveBeenCalled();
    });

    it('tracks telemetry with policy count', async () => {
      const mockPolicyId = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as `0x${string}`;
      const mockOnChainPolicy: OnChainPolicy = {
        policyId: mockPolicyId,
        name: 'Composite',
        creator: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
        applicableActorTypes: [],
        state: 0,
        createdAt: 1234567890n,
        expiresAt: 0n,
      };

      const mockContract = createMockContract({
        write: {
          compose: vi.fn().mockResolvedValue('0xtxhash'),
        },
        read: {
          getPolicy: vi.fn().mockResolvedValue(mockOnChainPolicy),
          getRules: vi.fn().mockResolvedValue([]),
        },
      });
      const mockPublicClient = createMockPublicClient();
      contracts = createMockContractFactory({
        contract: mockContract,
        publicClient: mockPublicClient,
      });
      policy = new PolicyEngine(contracts, events, telemetry);

      const trackSpy = vi.spyOn(telemetry, 'track');

      await policy.compose(['p1', 'p2', 'p3']);

      expect(trackSpy).toHaveBeenCalledWith('policy.compose', {
        count: 3,
      });
    });

    it('throws InvarianceError when fewer than 2 policies provided', async () => {
      contracts = createMockContractFactory();
      policy = new PolicyEngine(contracts, events, telemetry);

      await expect(policy.compose(['policy_1'])).rejects.toMatchObject({
        code: ErrorCode.POLICY_VIOLATION,
        message: expect.stringContaining('at least 2'),
      });
    });
  });

  describe('onViolation()', () => {
    beforeEach(() => {
      contracts = createMockContractFactory();
      policy = new PolicyEngine(contracts, events, telemetry);
    });

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

    it('tracks telemetry on subscription', () => {
      const trackSpy = vi.spyOn(telemetry, 'track');
      const callback = vi.fn();

      policy.onViolation('policy_1', callback);

      expect(trackSpy).toHaveBeenCalledWith('policy.onViolation');
    });
  });
});
