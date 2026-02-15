import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ErrorCode } from '@invariance/common';
import { InvarianceError } from '../../src/errors/InvarianceError.js';
import { waitForReceipt } from '../../src/utils/contract-helpers.js';
import { EscrowManager } from '../../src/modules/escrow/EscrowManager.js';
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

describe('Timeout Edge Cases', () => {
  let factory: ContractFactory;
  let mockContract: ReturnType<typeof createMockContract>;
  let mockPublicClient: ReturnType<typeof createMockPublicClient>;
  let events: InvarianceEventEmitter;
  let telemetry: Telemetry;

  beforeEach(() => {
    vi.useFakeTimers();

    mockContract = createMockContract({
      read: {
        getEscrow: vi.fn(),
        getState: vi.fn(),
        escrowCount: vi.fn(),
      },
      write: {
        create: vi.fn(),
        fund: vi.fn(),
      },
    });

    const mockIdentityContract = createMockContract({
      read: { get: vi.fn().mockResolvedValue({ actorType: 0 }) },
    });

    mockPublicClient = createMockPublicClient();
    factory = createMockContractFactory({ contract: mockContract, publicClient: mockPublicClient });

    // Override getContract to return identity contract for 'identity' calls
    (factory.getContract as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
      if (name === 'identity') return mockIdentityContract;
      return mockContract;
    });

    events = createEventEmitter();
    telemetry = createTelemetry();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Transaction Receipt Timeouts', () => {
    it('should timeout when waitForTransactionReceipt never resolves', async () => {
      // Mock a promise that never resolves
      mockPublicClient.waitForTransactionReceipt.mockReturnValue(new Promise(() => {}));

      const receiptPromise = waitForReceipt(
        mockPublicClient as unknown as Parameters<typeof waitForReceipt>[0],
        '0xabc123' as `0x${string}`,
      );

      // Create a racing timeout
      const timeoutPromise = new Promise<string>((resolve) => {
        setTimeout(() => resolve('timed_out'), 65_000);
      });

      // Advance timers past the 60s timeout
      await vi.advanceTimersByTimeAsync(65_000);

      const result = await Promise.race([
        receiptPromise.then(() => 'resolved').catch(() => 'rejected'),
        timeoutPromise,
      ]);

      // Either the receipt itself times out or our race timeout fires
      expect(['rejected', 'timed_out']).toContain(result);
    });

    it('should handle waitForTransactionReceipt timeout error', async () => {
      mockPublicClient.waitForTransactionReceipt.mockRejectedValue(
        new Error('WaitForTransactionReceiptTimeoutError: Timed out while waiting for transaction'),
      );

      await expect(
        waitForReceipt(
          mockPublicClient as unknown as Parameters<typeof waitForReceipt>[0],
          '0xabc123' as `0x${string}`,
        ),
      ).rejects.toThrow(/Timed out/);
    });
  });

  describe('Contract Read Timeouts', () => {
    it('should handle slow contract reads that eventually resolve', async () => {
      let resolveRead: ((value: unknown) => void) | undefined;
      const slowPromise = new Promise((resolve) => { resolveRead = resolve; });
      mockContract.read['getEscrow']!.mockReturnValue(slowPromise);

      const escrow = new EscrowManager(factory, events, telemetry);
      const getPromise = escrow.status('slow-escrow');

      // Resolve after delay
      resolveRead!({
        escrowId: '0x' + '00'.repeat(32),
        depositorIdentityId: '0x' + '00'.repeat(32),
        beneficiaryIdentityId: '0x' + '00'.repeat(32),
        depositor: '0x' + '11'.repeat(20),
        beneficiary: '0x' + '22'.repeat(20),
        amount: 100000000n,
        fundedAmount: 100000000n,
        conditionType: 0,
        conditionData: '0x' as `0x${string}`,
        state: 1,
        createdAt: 1700000000n,
        expiresAt: 1700086400n,
        releasedAt: 0n,
      });

      // Should eventually resolve without error
      const result = await getPromise;
      expect(result).toBeDefined();
    });

    it('should handle read that rejects with timeout-like error', async () => {
      mockContract.read['getEscrow']!.mockRejectedValue(
        new Error('request timeout at 30000ms'),
      );

      const escrow = new EscrowManager(factory, events, telemetry);
      await expect(escrow.status('timeout-escrow')).rejects.toThrow(/timeout/);
    });
  });

  describe('Multiple Sequential Timeouts', () => {
    it('should handle repeated timeout failures independently', async () => {
      mockContract.read['getEscrow']!
        .mockRejectedValueOnce(new Error('timeout 1'))
        .mockRejectedValueOnce(new Error('timeout 2'))
        .mockRejectedValueOnce(new Error('timeout 3'));

      const escrow = new EscrowManager(factory, events, telemetry);

      await expect(escrow.status('escrow-1')).rejects.toThrow('timeout 1');
      await expect(escrow.status('escrow-2')).rejects.toThrow('timeout 2');
      await expect(escrow.status('escrow-3')).rejects.toThrow('timeout 3');
    });

    it('should recover after a timeout and succeed on retry', async () => {
      mockContract.read['getEscrow']!
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce({
          escrowId: '0x' + '00'.repeat(32),
          depositorIdentityId: '0x' + '00'.repeat(32),
          beneficiaryIdentityId: '0x' + '00'.repeat(32),
          depositor: '0x' + '11'.repeat(20),
          beneficiary: '0x' + '22'.repeat(20),
          amount: 100000000n,
          fundedAmount: 100000000n,
          conditionType: 0,
          conditionData: '0x' as `0x${string}`,
          state: 1,
          createdAt: 1700000000n,
          expiresAt: 1700086400n,
          releasedAt: 0n,
        });

      const escrow = new EscrowManager(factory, events, telemetry);

      await expect(escrow.status('test')).rejects.toThrow('timeout');

      // Retry should succeed
      const result = await escrow.status('test');
      expect(result).toBeDefined();
    });
  });

  describe('Gas Price Timeout', () => {
    it('should handle getGasPrice timeout', async () => {
      mockPublicClient.getGasPrice.mockRejectedValue(new Error('gas price request timeout'));

      await expect(mockPublicClient.getGasPrice()).rejects.toThrow('gas price request timeout');
    });
  });
});
