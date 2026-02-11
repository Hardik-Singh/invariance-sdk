import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ErrorCode } from '@invariance/common';
import { EscrowManager } from '../../src/modules/escrow/EscrowManager.js';
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
import { toBytes32 } from '../../src/utils/contract-helpers.js';
import type { OnChainEscrow } from '../../src/modules/escrow/types.js';

/** Helper to create a mock on-chain escrow tuple */
function mockOnChainEscrow(overrides?: Partial<OnChainEscrow>): OnChainEscrow {
  return {
    escrowId: toBytes32('test-escrow-1'),
    depositorIdentityId: toBytes32('depositor-id'),
    beneficiaryIdentityId: toBytes32('beneficiary-id'),
    depositor: '0x1111111111111111111111111111111111111111' as `0x${string}`,
    beneficiary: '0x2222222222222222222222222222222222222222' as `0x${string}`,
    amount: 250000000n, // 250 USDC (6 decimals)
    fundedAmount: 250000000n,
    conditionType: 0, // TaskCompletion
    conditionData: '0x' as `0x${string}`,
    state: 1, // Funded
    createdAt: 1700000000n,
    expiresAt: 1700172800n, // 48h later
    releasedAt: 0n,
    ...overrides,
  };
}

describe('EscrowManager', () => {
  let factory: ContractFactory;
  let mockContract: ReturnType<typeof createMockContract>;
  let mockIdentityContract: ReturnType<typeof createMockContract>;
  let mockUsdcContract: ReturnType<typeof createMockContract>;
  let mockPublicClient: ReturnType<typeof createMockPublicClient>;
  let events: InvarianceEventEmitter;
  let telemetry: Telemetry;
  let escrow: EscrowManager;

  beforeEach(() => {
    // Create mock contracts for escrow, identity, and USDC
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

    mockIdentityContract = createMockContract({
      read: {
        resolve: vi.fn(),
      },
    });

    mockUsdcContract = createMockContract({
      write: {
        approve: vi.fn(),
      },
    });

    mockPublicClient = createMockPublicClient();
    factory = createMockContractFactory({ contract: mockContract, publicClient: mockPublicClient });

    // Get the existing getContract mock and reconfigure it
    const getContractSpy = vi.mocked(factory.getContract);
    getContractSpy.mockImplementation((name: string) => {
      if (name === 'identity') return mockIdentityContract as ReturnType<ContractFactory['getContract']>;
      if (name === 'mockUsdc') return mockUsdcContract as ReturnType<ContractFactory['getContract']>;
      return mockContract as ReturnType<ContractFactory['getContract']>;
    });

    // Mock wallet address
    vi.spyOn(factory, 'getWalletAddress').mockReturnValue('0x1111111111111111111111111111111111111111');

    events = createEventEmitter();
    telemetry = createTelemetry();
    escrow = new EscrowManager(factory, events, telemetry);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('create()', () => {
    it('calls contract.write.create with correct args for task-completion escrow', async () => {
      const rawEscrow = mockOnChainEscrow();
      mockIdentityContract.read.resolve
        .mockResolvedValueOnce(toBytes32('depositor-id'))
        .mockResolvedValueOnce(toBytes32('beneficiary-id'));
      mockContract.write.create.mockResolvedValue('0xtxhash' as `0x${string}`);
      mockContract.read.getEscrow.mockResolvedValue(rawEscrow);

      // Update mock receipt to include event log
      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        transactionHash: '0xtxhash' as `0x${string}`,
        blockNumber: 100n,
        gasUsed: 21000n,
        status: 'success' as const,
        logs: [{ topics: ['0xevent', toBytes32('test-escrow-1')], data: '0x' }],
      });

      await escrow.create({
        amount: '250.00',
        recipient: { type: 'agent', address: '0x2222222222222222222222222222222222222222' },
        conditions: { type: 'task-completion', timeout: '48h' },
      });

      expect(mockContract.write.create).toHaveBeenCalledOnce();
      const args = mockContract.write.create.mock.calls[0]![0] as unknown[];

      // depositorIdentityId
      expect(args[0]).toBe(toBytes32('depositor-id'));
      // beneficiaryIdentityId
      expect(args[1]).toBe(toBytes32('beneficiary-id'));
      // beneficiary address
      expect(args[2]).toBe('0x2222222222222222222222222222222222222222');
      // amount (250 USDC = 250000000 wei)
      expect(args[3]).toBe(250000000n);
      // conditionType (0 = TaskCompletion)
      expect(args[4]).toBe(0);
    });

    it('returns mapped EscrowContract with correct fields', async () => {
      const rawEscrow = mockOnChainEscrow();
      mockIdentityContract.read.resolve
        .mockResolvedValueOnce(toBytes32('depositor-id'))
        .mockResolvedValueOnce(toBytes32('beneficiary-id'));
      mockContract.write.create.mockResolvedValue('0xtxhash' as `0x${string}`);
      mockContract.read.getEscrow.mockResolvedValue(rawEscrow);

      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        transactionHash: '0xtxhash' as `0x${string}`,
        blockNumber: 100n,
        gasUsed: 21000n,
        status: 'success' as const,
        logs: [{ topics: ['0xevent', toBytes32('test-escrow-1')], data: '0x' }],
      });

      const result = await escrow.create({
        amount: '250.00',
        recipient: { type: 'agent', address: '0x2222222222222222222222222222222222222222' },
        conditions: { type: 'task-completion', timeout: '48h' },
      });

      expect(result.amount).toBe('250.000000');
      expect(result.state).toBe('funded');
      expect(result.recipient.address).toBe('0x2222222222222222222222222222222222222222');
    });

    it('auto-funds escrow when autoFund is true', async () => {
      const rawEscrow = mockOnChainEscrow();
      mockIdentityContract.read.resolve
        .mockResolvedValueOnce(toBytes32('depositor-id'))
        .mockResolvedValueOnce(toBytes32('beneficiary-id'));
      mockContract.write.create.mockResolvedValue('0xtxcreate' as `0x${string}`);
      mockContract.read.getEscrow.mockResolvedValue(rawEscrow);
      mockUsdcContract.write.approve.mockResolvedValue('0xtxapprove' as `0x${string}`);
      mockContract.write.fund.mockResolvedValue('0xtxfund' as `0x${string}`);

      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        transactionHash: '0xtxhash' as `0x${string}`,
        blockNumber: 100n,
        gasUsed: 21000n,
        status: 'success' as const,
        logs: [{ topics: ['0xevent', toBytes32('test-escrow-1')], data: '0x' }],
      });

      await escrow.create({
        amount: '250.00',
        recipient: { type: 'agent', address: '0x2222222222222222222222222222222222222222' },
        conditions: { type: 'task-completion', timeout: '48h' },
        autoFund: true,
      });

      expect(mockUsdcContract.write.approve).toHaveBeenCalled();
      expect(mockContract.write.fund).toHaveBeenCalled();
    });

    it('emits escrow.created event after tx success', async () => {
      const emitSpy = vi.spyOn(events, 'emit');
      const rawEscrow = mockOnChainEscrow();
      mockIdentityContract.read.resolve
        .mockResolvedValueOnce(toBytes32('depositor-id'))
        .mockResolvedValueOnce(toBytes32('beneficiary-id'));
      mockContract.write.create.mockResolvedValue('0xtxhash' as `0x${string}`);
      mockContract.read.getEscrow.mockResolvedValue(rawEscrow);

      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        transactionHash: '0xtxhash' as `0x${string}`,
        blockNumber: 100n,
        gasUsed: 21000n,
        status: 'success' as const,
        logs: [{ topics: ['0xevent', toBytes32('test-escrow-1')], data: '0x' }],
      });

      await escrow.create({
        amount: '250.00',
        recipient: { type: 'agent', address: '0x2222222222222222222222222222222222222222' },
        conditions: { type: 'task-completion', timeout: '48h' },
      });

      expect(emitSpy).toHaveBeenCalledWith('escrow.created', expect.objectContaining({
        amount: '250.000000',
      }));
    });
  });

  describe('fund()', () => {
    it('calls USDC approve then escrow fund', async () => {
      const rawEscrow = mockOnChainEscrow({ fundedAmount: 0n, state: 0 });
      mockContract.read.getEscrow.mockResolvedValue(rawEscrow);
      mockUsdcContract.write.approve.mockResolvedValue('0xtxapprove' as `0x${string}`);
      mockContract.write.fund.mockResolvedValue('0xtxfund' as `0x${string}`);

      await escrow.fund('test-escrow-1');

      expect(mockUsdcContract.write.approve).toHaveBeenCalledWith([
        expect.any(String),
        250000000n,
      ]);
      expect(mockContract.write.fund).toHaveBeenCalledWith([toBytes32('test-escrow-1')]);
    });

    it('returns transaction receipt', async () => {
      const rawEscrow = mockOnChainEscrow({ fundedAmount: 0n, state: 0 });
      mockContract.read.getEscrow.mockResolvedValue(rawEscrow);
      mockUsdcContract.write.approve.mockResolvedValue('0xtxapprove' as `0x${string}`);
      mockContract.write.fund.mockResolvedValue('0xtxfund' as `0x${string}`);

      const result = await escrow.fund('test-escrow-1');

      expect(result.txHash).toBe('0xabc123');
      expect(result.status).toBe('success');
    });
  });

  describe('release()', () => {
    it('calls contract.write.release with escrow ID', async () => {
      mockContract.write.release.mockResolvedValue('0xtxhash' as `0x${string}`);

      await escrow.release('test-escrow-1');

      expect(mockContract.write.release).toHaveBeenCalledWith([toBytes32('test-escrow-1')]);
    });

    it('emits escrow.released event after tx success', async () => {
      const emitSpy = vi.spyOn(events, 'emit');
      mockContract.write.release.mockResolvedValue('0xtxhash' as `0x${string}`);

      await escrow.release('test-escrow-1');

      expect(emitSpy).toHaveBeenCalledWith('escrow.released', { escrowId: 'test-escrow-1' });
    });
  });

  describe('refund()', () => {
    it('calls contract.write.refund with escrow ID', async () => {
      mockContract.write.refund.mockResolvedValue('0xtxhash' as `0x${string}`);

      await escrow.refund('test-escrow-1');

      expect(mockContract.write.refund).toHaveBeenCalledWith([toBytes32('test-escrow-1')]);
    });

    it('returns transaction receipt', async () => {
      mockContract.write.refund.mockResolvedValue('0xtxhash' as `0x${string}`);

      const result = await escrow.refund('test-escrow-1');

      expect(result.txHash).toBe('0xabc123');
      expect(result.status).toBe('success');
    });
  });

  describe('dispute()', () => {
    it('calls contract.write.dispute with escrow ID and reason', async () => {
      mockContract.write.dispute.mockResolvedValue('0xtxhash' as `0x${string}`);

      await escrow.dispute('test-escrow-1', 'Task not completed');

      expect(mockContract.write.dispute).toHaveBeenCalledWith([
        toBytes32('test-escrow-1'),
        'Task not completed',
      ]);
    });

    it('emits escrow.disputed event after tx success', async () => {
      const emitSpy = vi.spyOn(events, 'emit');
      mockContract.write.dispute.mockResolvedValue('0xtxhash' as `0x${string}`);

      await escrow.dispute('test-escrow-1', 'Task not completed');

      expect(emitSpy).toHaveBeenCalledWith('escrow.disputed', {
        escrowId: 'test-escrow-1',
        reason: 'Task not completed',
      });
    });
  });

  describe('resolve()', () => {
    it('calls contract.write.resolve with correct parameters', async () => {
      mockContract.write.resolve.mockResolvedValue('0xtxhash' as `0x${string}`);

      await escrow.resolve('test-escrow-1', {
        recipientShare: '100',
        depositorShare: '0',
      });

      expect(mockContract.write.resolve).toHaveBeenCalledWith([
        toBytes32('test-escrow-1'),
        'Dispute resolved',
        true, // releaseToBeneficiary
      ]);
    });

    it('releases to depositor when depositorShare is higher', async () => {
      mockContract.write.resolve.mockResolvedValue('0xtxhash' as `0x${string}`);

      await escrow.resolve('test-escrow-1', {
        recipientShare: '0',
        depositorShare: '100',
      });

      const args = mockContract.write.resolve.mock.calls[0]![0] as unknown[];
      expect(args[2]).toBe(false); // releaseToBeneficiary = false
    });
  });

  describe('approve()', () => {
    it('calls contract.write.approveRelease with escrow ID', async () => {
      mockContract.write.approveRelease.mockResolvedValue('0xtxhash' as `0x${string}`);

      await escrow.approve('test-escrow-1');

      expect(mockContract.write.approveRelease).toHaveBeenCalledWith([toBytes32('test-escrow-1')]);
    });

    it('returns ApprovalResult with threshold status', async () => {
      mockContract.write.approveRelease.mockResolvedValue('0xtxhash' as `0x${string}`);

      const result = await escrow.approve('test-escrow-1');

      expect(result).toMatchObject({
        signer: '0x1111111111111111111111111111111111111111',
        txHash: '0xabc123',
        approvalsReceived: 1,
        thresholdMet: false,
        remaining: 1,
      });
    });
  });

  describe('approvals()', () => {
    it('reads multi-sig escrow and returns approval status', async () => {
      const rawEscrow = mockOnChainEscrow({ conditionType: 1 }); // MultiSig
      mockContract.read.getEscrow.mockResolvedValue(rawEscrow);

      const result = await escrow.approvals('test-escrow-1');

      expect(result).toMatchObject({
        escrowId: 'test-escrow-1',
        threshold: 0,
        received: 0,
        signers: [],
        thresholdMet: false,
        autoReleased: false,
      });
    });

    it('throws error for non-multi-sig escrow', async () => {
      const rawEscrow = mockOnChainEscrow({ conditionType: 0 }); // TaskCompletion
      mockContract.read.getEscrow.mockResolvedValue(rawEscrow);

      await expect(escrow.approvals('test-escrow-1')).rejects.toThrow(InvarianceError);
      await expect(escrow.approvals('test-escrow-1')).rejects.toThrow('not a multi-sig escrow');
    });
  });

  describe('status()', () => {
    it('returns extended escrow status with time remaining', async () => {
      // Set expiry in the future
      const futureExpiry = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour from now
      const rawEscrow = mockOnChainEscrow({ expiresAt: futureExpiry });
      mockContract.read.getEscrow.mockResolvedValue(rawEscrow);

      const result = await escrow.status('test-escrow-1');

      expect(result).toMatchObject({
        escrowId: expect.any(String),
        amount: '250.000000',
        state: 'funded',
      });
      expect(result.timeRemaining).toBeGreaterThan(0);
    });

    it('includes dispute reason for disputed escrows', async () => {
      const rawEscrow = mockOnChainEscrow({ state: 5 }); // Disputed
      mockContract.read.getEscrow.mockResolvedValue(rawEscrow);
      mockContract.read.getDispute.mockResolvedValue({
        reason: 'Task not completed',
      });

      const result = await escrow.status('test-escrow-1');

      expect(result.disputeReason).toBe('Task not completed');
    });

    it('includes approvals for multi-sig escrows', async () => {
      const rawEscrow = mockOnChainEscrow({ conditionType: 1 }); // MultiSig
      mockContract.read.getEscrow.mockResolvedValue(rawEscrow);

      const result = await escrow.status('test-escrow-1');

      expect(result.approvals).toBeDefined();
    });
  });

  describe('list()', () => {
    it('returns empty array when indexer not available', async () => {
      mockContract.read.escrowCount.mockResolvedValue(0n);

      const result = await escrow.list();

      expect(result).toEqual([]);
    });

    it('tracks telemetry for list calls', async () => {
      const trackSpy = vi.spyOn(telemetry, 'track');
      mockContract.read.escrowCount.mockResolvedValue(0n);

      await escrow.list({ limit: 10 });

      expect(trackSpy).toHaveBeenCalledWith('escrow.list', { hasFilters: true });
    });
  });

  describe('error handling', () => {
    it('maps contract errors to InvarianceError', async () => {
      mockContract.write.release.mockRejectedValue({
        name: 'ContractFunctionRevertedError',
        data: { errorName: 'EscrowNotFound' },
        message: 'EscrowNotFound',
      });

      await expect(escrow.release('invalid-id')).rejects.toThrow(InvarianceError);
      await expect(escrow.release('invalid-id')).rejects.toMatchObject({
        code: ErrorCode.ESCROW_NOT_FOUND,
      });
    });

    it('handles invalid timeout format', async () => {
      mockIdentityContract.read.resolve
        .mockResolvedValueOnce(toBytes32('depositor-id'))
        .mockResolvedValueOnce(toBytes32('beneficiary-id'));

      await expect(
        escrow.create({
          amount: '250.00',
          recipient: { type: 'agent', address: '0x2222222222222222222222222222222222222222' },
          conditions: { type: 'task-completion', timeout: 'invalid' },
        }),
      ).rejects.toThrow(InvarianceError);
    });
  });

  describe('telemetry tracking', () => {
    it('tracks create with condition type', async () => {
      const trackSpy = vi.spyOn(telemetry, 'track');
      const rawEscrow = mockOnChainEscrow();
      mockIdentityContract.read.resolve
        .mockResolvedValueOnce(toBytes32('depositor-id'))
        .mockResolvedValueOnce(toBytes32('beneficiary-id'));
      mockContract.write.create.mockResolvedValue('0xtxhash' as `0x${string}`);
      mockContract.read.getEscrow.mockResolvedValue(rawEscrow);

      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        transactionHash: '0xtxhash' as `0x${string}`,
        blockNumber: 100n,
        gasUsed: 21000n,
        status: 'success' as const,
        logs: [{ topics: ['0xevent', toBytes32('test-escrow-1')], data: '0x' }],
      });

      await escrow.create({
        amount: '250.00',
        recipient: { type: 'agent', address: '0x2222222222222222222222222222222222222222' },
        conditions: { type: 'task-completion', timeout: '48h' },
      });

      expect(trackSpy).toHaveBeenCalledWith('escrow.create', {
        conditionType: 'task-completion',
        autoFund: false,
      });
    });

    it('tracks all method calls', async () => {
      const trackSpy = vi.spyOn(telemetry, 'track');
      mockContract.write.release.mockResolvedValue('0xtx' as `0x${string}`);
      mockContract.write.refund.mockResolvedValue('0xtx' as `0x${string}`);
      mockContract.write.dispute.mockResolvedValue('0xtx' as `0x${string}`);
      mockContract.write.approveRelease.mockResolvedValue('0xtx' as `0x${string}`);

      await escrow.release('test-1');
      await escrow.refund('test-2');
      await escrow.dispute('test-3', 'reason');
      await escrow.approve('test-4');

      expect(trackSpy).toHaveBeenCalledWith('escrow.release');
      expect(trackSpy).toHaveBeenCalledWith('escrow.refund');
      expect(trackSpy).toHaveBeenCalledWith('escrow.dispute');
      expect(trackSpy).toHaveBeenCalledWith('escrow.approve');
    });
  });
});
