import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCode } from '@invariance/common';
import { EscrowManager } from '../../src/modules/escrow/EscrowManager.js';
import { InvarianceError } from '../../src/errors/InvarianceError.js';
import {
  mapContractError,
  waitForReceipt,
  toBytes32,
  actorTypeToEnum,
  identityStatusFromEnum,
} from '../../src/utils/contract-helpers.js';
import {
  createMockContract,
  createMockPublicClient,
  createMockContractFactory,
  createEventEmitter,
  createTelemetry,
  createMockSetup,
} from '../fixtures/mocks.js';
import type { ContractFactory } from '../../src/core/ContractFactory.js';
import type { InvarianceEventEmitter } from '../../src/core/EventEmitter.js';
import type { Telemetry } from '../../src/core/Telemetry.js';

describe('Error Handling Edge Cases', () => {
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
        isParty: vi.fn(),
        escrowCount: vi.fn(),
        getDispute: vi.fn(),
      },
      write: {
        create: vi.fn(),
        fund: vi.fn(),
        release: vi.fn(),
        refund: vi.fn(),
        dispute: vi.fn(),
        resolve: vi.fn(),
        approveRelease: vi.fn(),
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
    escrow = new EscrowManager(factory, events, telemetry);
  });

  describe('RPC Failures', () => {
    it('should handle RPC timeout on contract read', async () => {
      mockContract.read['getEscrow']!.mockRejectedValue(new Error('request timeout'));

      await expect(escrow.status('test-escrow-1')).rejects.toThrow();
    });

    it('should handle connection refused errors', async () => {
      mockContract.read['getEscrow']!.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(escrow.status('test-escrow-1')).rejects.toThrow();
    });

    it('should handle network disconnection mid-request', async () => {
      mockContract.read['getEscrow']!.mockRejectedValue(new Error('network socket disconnected'));

      await expect(escrow.status('test-escrow-1')).rejects.toThrow();
    });
  });

  describe('Contract Revert Handling via mapContractError', () => {
    it('should pass through InvarianceError unchanged', () => {
      const original = new InvarianceError(ErrorCode.ESCROW_NOT_FOUND, 'not found');
      const result = mapContractError(original);
      expect(result).toBe(original);
      expect(result.code).toBe(ErrorCode.ESCROW_NOT_FOUND);
    });

    it('should map ContractFunctionRevertedError with known error name', () => {
      const revertError = {
        name: 'ContractFunctionRevertedError',
        data: { errorName: 'EscrowNotFound' },
        message: 'Contract call reverted',
      };
      const result = mapContractError(revertError);
      expect(result).toBeInstanceOf(InvarianceError);
    });

    it('should wrap unknown errors as NETWORK_ERROR', () => {
      const result = mapContractError(new Error('something unexpected'));
      expect(result).toBeInstanceOf(InvarianceError);
      expect(result.code).toBe(ErrorCode.NETWORK_ERROR);
    });

    it('should handle null/undefined errors gracefully', () => {
      const result = mapContractError(null);
      expect(result).toBeInstanceOf(InvarianceError);
    });

    it('should handle string errors', () => {
      const result = mapContractError('raw string error');
      expect(result).toBeInstanceOf(InvarianceError);
    });
  });

  describe('waitForReceipt Error Cases', () => {
    it('should throw TX_REVERTED for reverted transactions', async () => {
      const client = createMockPublicClient({
        receipt: { status: 'reverted', transactionHash: '0xdead' as `0x${string}` },
      });

      await expect(
        waitForReceipt(client as unknown as Parameters<typeof waitForReceipt>[0], '0xdead' as `0x${string}`),
      ).rejects.toThrow(InvarianceError);

      try {
        await waitForReceipt(client as unknown as Parameters<typeof waitForReceipt>[0], '0xdead' as `0x${string}`);
      } catch (err) {
        expect(err).toBeInstanceOf(InvarianceError);
        expect((err as InvarianceError).code).toBe(ErrorCode.TX_REVERTED);
        expect((err as InvarianceError).txHash).toBe('0xdead');
      }
    });

    it('should propagate waitForTransactionReceipt rejection', async () => {
      const client = createMockPublicClient();
      client.waitForTransactionReceipt.mockRejectedValue(new Error('RPC node unreachable'));

      await expect(
        waitForReceipt(client as unknown as Parameters<typeof waitForReceipt>[0], '0xabc' as `0x${string}`),
      ).rejects.toThrow('RPC node unreachable');
    });
  });

  describe('Invalid Input Validation', () => {
    it('should reject toBytes32 with oversized string', () => {
      const longId = 'a'.repeat(40); // > 32 bytes
      expect(() => toBytes32(longId)).toThrow(InvarianceError);
      expect(() => toBytes32(longId)).toThrow(/exceeds 32 bytes/);
    });

    it('should reject toBytes32 with oversized hex', () => {
      const longHex = '0x' + 'ff'.repeat(40); // > 32 bytes
      expect(() => toBytes32(longHex)).toThrow(InvarianceError);
    });

    it('should handle toBytes32 with valid inputs', () => {
      expect(toBytes32('hello')).toMatch(/^0x[0-9a-f]{64}$/);
      expect(toBytes32('0x' + 'ab'.repeat(32))).toBe('0x' + 'ab'.repeat(32));
    });

    it('should reject unknown actor types', () => {
      expect(() => actorTypeToEnum('unknown' as never)).toThrow(InvarianceError);
    });

    it('should reject unknown identity status enums', () => {
      expect(() => identityStatusFromEnum(99)).toThrow(InvarianceError);
    });
  });

  describe('InvarianceError Construction', () => {
    it('should preserve error code and message', () => {
      const err = new InvarianceError(ErrorCode.ESCROW_NOT_FOUND, 'Escrow xyz not found');
      expect(err.code).toBe(ErrorCode.ESCROW_NOT_FOUND);
      expect(err.message).toBe('Escrow xyz not found');
      expect(err.name).toBe('InvarianceError');
    });

    it('should preserve optional explorerUrl and txHash', () => {
      const err = new InvarianceError(ErrorCode.TX_REVERTED, 'reverted', {
        explorerUrl: 'https://basescan.org/tx/0x123',
        txHash: '0x123',
      });
      expect(err.explorerUrl).toBe('https://basescan.org/tx/0x123');
      expect(err.txHash).toBe('0x123');
    });

    it('should be instanceof Error', () => {
      const err = new InvarianceError(ErrorCode.NETWORK_ERROR, 'net err');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(InvarianceError);
    });
  });
});
