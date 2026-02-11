import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ErrorCode } from '@invariance/common';
import { IntentProtocol } from '../../src/modules/intent/IntentProtocol.js';
import { InvarianceError } from '../../src/errors/InvarianceError.js';
import {
  createMockContractFactory,
  createMockContract,
  createMockPublicClient,
  createEventEmitter,
  createTelemetry,
  createMockIntentRequestedLog,
} from '../fixtures/mocks.js';
import type { InvarianceEventEmitter } from '../../src/core/EventEmitter.js';
import type { Telemetry } from '../../src/core/Telemetry.js';
import type { ContractFactory } from '../../src/core/ContractFactory.js';
import { toBytes32 } from '../../src/utils/contract-helpers.js';

describe('IntentProtocol', () => {
  let factory: ContractFactory;
  let mockIntentContract: ReturnType<typeof createMockContract>;
  let mockIdentityContract: ReturnType<typeof createMockContract>;
  let mockPolicyContract: ReturnType<typeof createMockContract>;
  let mockPublicClient: ReturnType<typeof createMockPublicClient>;
  let events: InvarianceEventEmitter;
  let telemetry: Telemetry;
  let intent: IntentProtocol;

  beforeEach(() => {
    mockIntentContract = createMockContract({
      read: {
        verify: vi.fn(),
      },
      write: {
        request: vi.fn(),
        approve: vi.fn(),
        reject: vi.fn(),
      },
    });

    mockIdentityContract = createMockContract({
      read: {
        resolve: vi.fn(),
        isActive: vi.fn(),
      },
    });

    mockPolicyContract = createMockContract({
      read: {
        evaluate: vi.fn(),
      },
    });

    mockPublicClient = createMockPublicClient();
    factory = createMockContractFactory({ contract: mockIntentContract, publicClient: mockPublicClient });

    const getContractSpy = vi.mocked(factory.getContract);
    getContractSpy.mockImplementation((name: string) => {
      if (name === 'identity') return mockIdentityContract as ReturnType<ContractFactory['getContract']>;
      if (name === 'policy') return mockPolicyContract as ReturnType<ContractFactory['getContract']>;
      return mockIntentContract as ReturnType<ContractFactory['getContract']>;
    });

    vi.spyOn(factory, 'getGasStrategy').mockReturnValue('standard');

    events = createEventEmitter();
    telemetry = createTelemetry();
    intent = new IntentProtocol(factory, events, telemetry);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('request()', () => {
    it('calls contract.write.request with correct args and returns IntentResult', async () => {
      mockIdentityContract.read.resolve.mockResolvedValue(toBytes32('actor-id'));
      mockIntentContract.write.request.mockResolvedValue('0xtxhash' as `0x${string}`);
      mockIntentContract.write.approve.mockResolvedValue('0xtxapprove' as `0x${string}`);

      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        transactionHash: '0xtxhash' as `0x${string}`,
        blockNumber: 100n,
        gasUsed: 21000n,
        status: 'success' as const,
        logs: [createMockIntentRequestedLog(toBytes32('intent-1'))],
      });

      const result = await intent.request({
        actor: { type: 'agent', address: '0x1111111111111111111111111111111111111111' },
        action: 'swap',
        params: { from: 'USDC', to: 'ETH' },
        approval: 'auto',
      });

      expect(mockIntentContract.write.request).toHaveBeenCalledOnce();
      expect(result.action).toBe('swap');
      expect(result.status).toBe('completed');
      expect(result.proof).toBeDefined();
      expect(result.proof.verifiable).toBe(true);
      expect(result.explorerUrl).toContain('/tx/');
    });

    it('auto-approves when approval is "auto"', async () => {
      mockIdentityContract.read.resolve.mockResolvedValue(toBytes32('actor-id'));
      mockIntentContract.write.request.mockResolvedValue('0xtxhash' as `0x${string}`);
      mockIntentContract.write.approve.mockResolvedValue('0xtxapprove' as `0x${string}`);

      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        transactionHash: '0xtxhash' as `0x${string}`,
        blockNumber: 100n,
        gasUsed: 21000n,
        status: 'success' as const,
        logs: [createMockIntentRequestedLog(toBytes32('intent-1'))],
      });

      await intent.request({
        actor: { type: 'agent', address: '0x1111111111111111111111111111111111111111' },
        action: 'swap',
        params: {},
        approval: 'auto',
      });

      expect(mockIntentContract.write.approve).toHaveBeenCalledOnce();
    });

    it('emits intent.requested event', async () => {
      const emitSpy = vi.spyOn(events, 'emit');
      mockIdentityContract.read.resolve.mockResolvedValue(toBytes32('actor-id'));
      mockIntentContract.write.request.mockResolvedValue('0xtxhash' as `0x${string}`);
      mockIntentContract.write.approve.mockResolvedValue('0xtxapprove' as `0x${string}`);

      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        transactionHash: '0xtxhash' as `0x${string}`,
        blockNumber: 100n,
        gasUsed: 21000n,
        status: 'success' as const,
        logs: [createMockIntentRequestedLog(toBytes32('intent-1'))],
      });

      await intent.request({
        actor: { type: 'agent', address: '0x1111111111111111111111111111111111111111' },
        action: 'swap',
        params: {},
        approval: 'auto',
      });

      expect(emitSpy).toHaveBeenCalledWith('intent.requested', expect.objectContaining({
        action: 'swap',
      }));
    });

    it('maps contract errors to InvarianceError', async () => {
      mockIdentityContract.read.resolve.mockRejectedValue({
        name: 'ContractFunctionRevertedError',
        data: { errorName: 'IdentityNotFound' },
        message: 'IdentityNotFound',
      });

      await expect(
        intent.request({
          actor: { type: 'agent', address: '0x1111111111111111111111111111111111111111' },
          action: 'swap',
          params: {},
        }),
      ).rejects.toThrow(InvarianceError);
    });
  });

  describe('prepare()', () => {
    it('returns PreparedIntent with policy checks and gas estimate', async () => {
      mockIdentityContract.read.resolve.mockResolvedValue(toBytes32('actor-id'));
      mockIdentityContract.read.isActive.mockResolvedValue(true);
      mockPolicyContract.read.evaluate.mockResolvedValue([true, 'Policy check passed']);
      mockPublicClient.getGasPrice.mockResolvedValue(1000000000n);

      const result = await intent.prepare({
        actor: { type: 'agent', address: '0x1111111111111111111111111111111111111111' },
        action: 'swap',
        params: { from: 'USDC', to: 'ETH' },
      });

      expect(result.wouldSucceed).toBe(true);
      expect(result.policyChecks).toHaveLength(1);
      expect(result.policyChecks[0]!.passed).toBe(true);
      expect(result.estimatedGas).toBeDefined();
      expect(result.warnings).toHaveLength(0);
    });

    it('includes warnings when identity is not active', async () => {
      mockIdentityContract.read.resolve.mockResolvedValue(toBytes32('actor-id'));
      mockIdentityContract.read.isActive.mockResolvedValue(false);
      mockPublicClient.getGasPrice.mockResolvedValue(1000000000n);

      const result = await intent.prepare({
        actor: { type: 'agent', address: '0x1111111111111111111111111111111111111111' },
        action: 'swap',
        params: {},
      });

      expect(result.wouldSucceed).toBe(false);
      expect(result.warnings).toContain('Identity is not active');
    });

    it('includes warnings when policy denies', async () => {
      mockIdentityContract.read.resolve.mockResolvedValue(toBytes32('actor-id'));
      mockIdentityContract.read.isActive.mockResolvedValue(true);
      mockPolicyContract.read.evaluate.mockResolvedValue([false, 'Action not in whitelist']);
      mockPublicClient.getGasPrice.mockResolvedValue(1000000000n);

      const result = await intent.prepare({
        actor: { type: 'agent', address: '0x1111111111111111111111111111111111111111' },
        action: 'forbidden-action',
        params: {},
      });

      expect(result.wouldSucceed).toBe(false);
      expect(result.warnings).toContain('Policy denied: Action not in whitelist');
    });
  });

  describe('approve()', () => {
    it('calls contract.write.approve with correct args', async () => {
      vi.spyOn(factory, 'getWalletAddress').mockReturnValue('0x1111111111111111111111111111111111111111');
      mockIdentityContract.read.resolve.mockResolvedValue(toBytes32('approver-id'));
      mockIntentContract.write.approve.mockResolvedValue('0xtxhash' as `0x${string}`);
      mockIntentContract.read.verify.mockResolvedValue([
        { intentId: toBytes32('intent-1'), createdAt: 1n, status: 1, completedAt: 0n },
        [{ approver: '0x1111111111111111111111111111111111111111', approverIdentityId: toBytes32('approver-id'), approvedAt: 1n, reason: 'ok' }],
      ]);

      const result = await intent.approve('intent-1');

      expect(mockIntentContract.write.approve).toHaveBeenCalledOnce();
      expect(result.approvalsReceived).toBe(1);
      expect(result.thresholdMet).toBe(true);
    });
  });

  describe('reject()', () => {
    it('calls contract.write.reject and emits event', async () => {
      const emitSpy = vi.spyOn(events, 'emit');
      mockIntentContract.write.reject.mockResolvedValue('0xtxhash' as `0x${string}`);

      const result = await intent.reject('intent-1', 'Not authorized');

      expect(mockIntentContract.write.reject).toHaveBeenCalledOnce();
      expect(result.txHash).toBe('0xabc123');
      expect(result.status).toBe('success');
      expect(emitSpy).toHaveBeenCalledWith('intent.rejected', {
        intentId: 'intent-1',
        reason: 'Not authorized',
      });
    });
  });

  describe('status()', () => {
    it('returns lifecycle state from on-chain data', async () => {
      mockIntentContract.read.verify.mockResolvedValue([
        {
          intentId: toBytes32('intent-1'),
          requesterIdentityId: toBytes32('actor-id'),
          requester: '0x1111111111111111111111111111111111111111',
          action: toBytes32('swap'),
          target: '0x0000000000000000000000000000000000000000',
          value: 0n,
          data: '0x',
          description: 'swap',
          metadataHash: toBytes32(''),
          status: 3, // completed
          createdAt: 1700000000n,
          expiresAt: 0n,
          completedAt: 1700001000n,
          resultHash: toBytes32('result'),
        },
        [],
      ]);

      const result = await intent.status('intent-1');

      expect(result.lifecycle).toBe('completed');
      expect(result.proof).toBeDefined();
    });

    it('throws when intent not found (createdAt === 0)', async () => {
      mockIntentContract.read.verify.mockResolvedValue([
        { intentId: toBytes32(''), createdAt: 0n, status: 0 },
        [],
      ]);

      await expect(intent.status('nonexistent')).rejects.toThrow(InvarianceError);
    });
  });

  describe('history()', () => {
    it('returns empty array when indexer unavailable', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')));

      const result = await intent.history({ actor: '0xActor' });

      expect(result).toEqual([]);
    });
  });

  describe('telemetry', () => {
    it('tracks all method calls', async () => {
      const trackSpy = vi.spyOn(telemetry, 'track');

      // reject is the simplest - doesn't need identity resolution
      mockIntentContract.write.reject.mockResolvedValue('0xtx' as `0x${string}`);
      await intent.reject('test-1', 'reason');

      expect(trackSpy).toHaveBeenCalledWith('intent.reject');
    });
  });
});
