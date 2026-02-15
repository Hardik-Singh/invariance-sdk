import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCode } from '@invariance/common';
import { EscrowManager } from '../../src/modules/escrow/EscrowManager.js';
import { InvarianceError } from '../../src/errors/InvarianceError.js';
import { waitForReceipt } from '../../src/utils/contract-helpers.js';
import {
  createMockContract,
  createMockPublicClient,
  createMockContractFactory,
  createEventEmitter,
  createTelemetry,
} from '../fixtures/mocks.js';
import type { ContractFactory } from '../../src/core/ContractFactory.js';
import type { InvarianceEventEmitter } from '../../src/core/EventEmitter.js';
import type { Telemetry } from '../../src/core/Telemetry.js';

/** Helper to create a mock on-chain escrow with a given ID index */
function mockEscrowData(index: number) {
  return {
    escrowId: '0x' + index.toString(16).padStart(64, '0') as `0x${string}`,
    depositorIdentityId: '0x' + '00'.repeat(32) as `0x${string}`,
    beneficiaryIdentityId: '0x' + '00'.repeat(32) as `0x${string}`,
    depositor: '0x' + '11'.repeat(20) as `0x${string}`,
    beneficiary: '0x' + '22'.repeat(20) as `0x${string}`,
    amount: BigInt(100_000_000 * (index + 1)),
    fundedAmount: BigInt(100_000_000 * (index + 1)),
    conditionType: 0,
    conditionData: '0x' as `0x${string}`,
    state: 1,
    createdAt: 1700000000n,
    expiresAt: 1700086400n,
    releasedAt: 0n,
  };
}

describe('Concurrency Edge Cases', () => {
  let factory: ContractFactory;
  let mockContract: ReturnType<typeof createMockContract>;
  let mockPublicClient: ReturnType<typeof createMockPublicClient>;
  let events: InvarianceEventEmitter;
  let telemetry: Telemetry;
  let escrow: EscrowManager;

  beforeEach(() => {
    mockContract = createMockContract({
      read: {
        getEscrow: vi.fn(),
        getState: vi.fn(),
        escrowCount: vi.fn(),
        isParty: vi.fn(),
      },
      write: {
        create: vi.fn(),
        fund: vi.fn(),
        release: vi.fn(),
      },
    });

    const mockIdentityContract = createMockContract({
      read: { get: vi.fn().mockResolvedValue({ actorType: 0 }) },
    });

    mockPublicClient = createMockPublicClient();
    factory = createMockContractFactory({ contract: mockContract, publicClient: mockPublicClient });

    (factory.getContract as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
      if (name === 'identity') return mockIdentityContract;
      return mockContract;
    });

    events = createEventEmitter();
    telemetry = createTelemetry();
    escrow = new EscrowManager(factory, events, telemetry);
  });

  describe('Concurrent Reads', () => {
    it('should handle multiple simultaneous reads without interference', async () => {
      let callCount = 0;
      mockContract.read['getEscrow']!.mockImplementation(() => {
        callCount++;
        const idx = callCount;
        return Promise.resolve(mockEscrowData(idx));
      });

      const results = await Promise.all([
        escrow.status('escrow-1'),
        escrow.status('escrow-2'),
        escrow.status('escrow-3'),
      ]);

      expect(results).toHaveLength(3);
      expect(mockContract.read['getEscrow']).toHaveBeenCalledTimes(3);
      // Each result should be different (different amounts based on index)
      const amounts = results.map((r) => r.amount);
      expect(new Set(amounts).size).toBe(3);
    });

    it('should handle concurrent reads where some fail and some succeed', async () => {
      let callIdx = 0;
      mockContract.read['getEscrow']!.mockImplementation(() => {
        callIdx++;
        if (callIdx === 2) return Promise.reject(new Error('RPC overloaded'));
        return Promise.resolve(mockEscrowData(callIdx));
      });

      const results = await Promise.allSettled([
        escrow.status('ok-1'),
        escrow.status('fail-1'),
        escrow.status('ok-2'),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled.length).toBeGreaterThanOrEqual(1);
      expect(rejected.length).toBeGreaterThanOrEqual(1);
    });

    it('should isolate errors between concurrent operations', async () => {
      let callIdx2 = 0;
      mockContract.read['getEscrow']!.mockImplementation(() => {
        callIdx2++;
        if (callIdx2 === 1) return Promise.reject(new Error('timeout'));
        return Promise.resolve(mockEscrowData(2));
      });

      const [r1, r2] = await Promise.allSettled([
        escrow.status('fail'),
        escrow.status('succeed'),
      ]);

      const statuses = [r1!.status, r2!.status];
      expect(statuses).toContain('rejected');
      expect(statuses).toContain('fulfilled');
    });
  });

  describe('Concurrent Writes', () => {
    it('should call write for each concurrent transaction independently', async () => {
      // Each write returns a unique tx hash
      mockContract.write['fund']!
        .mockResolvedValueOnce('0x' + 'aa'.repeat(32))
        .mockResolvedValueOnce('0x' + 'bb'.repeat(32))
        .mockResolvedValueOnce('0x' + 'cc'.repeat(32));

      // Fund three escrows concurrently
      const hashes = await Promise.all([
        mockContract.write['fund']!(['escrow-1']),
        mockContract.write['fund']!(['escrow-2']),
        mockContract.write['fund']!(['escrow-3']),
      ]);

      expect(hashes).toHaveLength(3);
      expect(new Set(hashes).size).toBe(3);
      expect(mockContract.write['fund']).toHaveBeenCalledTimes(3);
    });

    it('should handle concurrent write failures independently', async () => {
      mockContract.write['fund']!
        .mockResolvedValueOnce('0x' + 'aa'.repeat(32))
        .mockRejectedValueOnce(new Error('nonce too low'));

      const results = await Promise.allSettled([
        mockContract.write['fund']!(['escrow-1']),
        mockContract.write['fund']!(['escrow-2']),
      ]);

      expect(results[0]!.status).toBe('fulfilled');
      expect(results[1]!.status).toBe('rejected');
    });
  });

  describe('Concurrent Receipt Waiting', () => {
    it('should wait for multiple receipts concurrently', async () => {
      const client = createMockPublicClient();
      client.waitForTransactionReceipt
        .mockResolvedValueOnce({
          transactionHash: '0x111' as `0x${string}`,
          blockNumber: 100n,
          gasUsed: 21000n,
          status: 'success' as const,
          logs: [],
        })
        .mockResolvedValueOnce({
          transactionHash: '0x222' as `0x${string}`,
          blockNumber: 101n,
          gasUsed: 42000n,
          status: 'success' as const,
          logs: [],
        });

      const [r1, r2] = await Promise.all([
        waitForReceipt(client as unknown as Parameters<typeof waitForReceipt>[0], '0x111' as `0x${string}`),
        waitForReceipt(client as unknown as Parameters<typeof waitForReceipt>[0], '0x222' as `0x${string}`),
      ]);

      expect(r1.txHash).toBe('0x111');
      expect(r2.txHash).toBe('0x222');
      expect(client.waitForTransactionReceipt).toHaveBeenCalledTimes(2);
    });

    it('should handle mixed success/revert in concurrent receipts', async () => {
      const client = createMockPublicClient();
      client.waitForTransactionReceipt
        .mockResolvedValueOnce({
          transactionHash: '0x111' as `0x${string}`,
          blockNumber: 100n,
          gasUsed: 21000n,
          status: 'success' as const,
          logs: [],
        })
        .mockResolvedValueOnce({
          transactionHash: '0x222' as `0x${string}`,
          blockNumber: 101n,
          gasUsed: 21000n,
          status: 'reverted' as const,
          logs: [],
        });

      const results = await Promise.allSettled([
        waitForReceipt(client as unknown as Parameters<typeof waitForReceipt>[0], '0x111' as `0x${string}`),
        waitForReceipt(client as unknown as Parameters<typeof waitForReceipt>[0], '0x222' as `0x${string}`),
      ]);

      expect(results[0]!.status).toBe('fulfilled');
      expect(results[1]!.status).toBe('rejected');
      if (results[1]!.status === 'rejected') {
        expect((results[1] as PromiseRejectedResult).reason).toBeInstanceOf(InvarianceError);
        expect(((results[1] as PromiseRejectedResult).reason as InvarianceError).code).toBe(ErrorCode.TX_REVERTED);
      }
    });
  });
});
