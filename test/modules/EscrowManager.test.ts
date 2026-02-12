import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ErrorCode } from '@invariance/common';
import { encodeAbiParameters, encodeEventTopics, getAddress, type Abi } from 'viem';
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
import { InvarianceEscrowAbi } from '../../src/contracts/abis/index.js';
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
        get: vi.fn().mockResolvedValue({ actorType: 0 }), // default: agent
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

    it('returns ApprovalResult with defaults when no event log present', async () => {
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

    it('parses approval count and threshold from EscrowApproved event', async () => {
      mockContract.write.approveRelease.mockResolvedValue('0xtxhash' as `0x${string}`);

      // Build a properly ABI-encoded EscrowApproved event log
      const topics = encodeEventTopics({
        abi: InvarianceEscrowAbi as Abi,
        eventName: 'EscrowApproved',
        args: {
          escrowId: toBytes32('test-escrow-1'),
          approver: '0x1111111111111111111111111111111111111111' as `0x${string}`,
        },
      });
      const data = encodeAbiParameters(
        [{ type: 'uint256' }, { type: 'uint256' }],
        [2n, 3n], // approvalCount=2, threshold=3
      );

      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        transactionHash: '0xtxhash' as `0x${string}`,
        blockNumber: 100n,
        gasUsed: 21000n,
        status: 'success' as const,
        logs: [{ topics: topics as readonly string[], data }],
      });

      const result = await escrow.approve('test-escrow-1');

      expect(result.approvalsReceived).toBe(2);
      expect(result.thresholdMet).toBe(false);
      expect(result.remaining).toBe(1);
    });

    it('detects threshold met when approvalCount >= threshold', async () => {
      mockContract.write.approveRelease.mockResolvedValue('0xtxhash' as `0x${string}`);

      const topics = encodeEventTopics({
        abi: InvarianceEscrowAbi as Abi,
        eventName: 'EscrowApproved',
        args: {
          escrowId: toBytes32('test-escrow-1'),
          approver: '0x1111111111111111111111111111111111111111' as `0x${string}`,
        },
      });
      const data = encodeAbiParameters(
        [{ type: 'uint256' }, { type: 'uint256' }],
        [3n, 3n], // approvalCount=3, threshold=3 — met!
      );

      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        transactionHash: '0xtxhash' as `0x${string}`,
        blockNumber: 100n,
        gasUsed: 21000n,
        status: 'success' as const,
        logs: [{ topics: topics as readonly string[], data }],
      });

      const result = await escrow.approve('test-escrow-1');

      expect(result.approvalsReceived).toBe(3);
      expect(result.thresholdMet).toBe(true);
      expect(result.remaining).toBe(0);
    });
  });

  describe('approvals()', () => {
    it('reads multi-sig escrow and returns approval status with decoded signers', async () => {
      const signers = [
        getAddress('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
        getAddress('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'),
        getAddress('0xcccccccccccccccccccccccccccccccccccccccc'),
      ];
      const conditionData = encodeAbiParameters(
        [{ type: 'address[]' }, { type: 'uint256' }, { type: 'uint256' }],
        [signers, 2n, 0n],
      );
      const rawEscrow = mockOnChainEscrow({ conditionType: 1, conditionData });
      mockContract.read.getEscrow.mockResolvedValue(rawEscrow);

      const result = await escrow.approvals('test-escrow-1');

      expect(result.escrowId).toBe('test-escrow-1');
      expect(result.threshold).toBe(2);
      expect(result.signers).toHaveLength(3);
      expect(result.signers[0]!.address).toMatch(/0xaaaa/i);
      expect(result.thresholdMet).toBe(false);
      expect(result.autoReleased).toBe(false);
    });

    it('returns empty signers when conditionData is empty', async () => {
      const rawEscrow = mockOnChainEscrow({ conditionType: 1 }); // MultiSig, no conditionData
      mockContract.read.getEscrow.mockResolvedValue(rawEscrow);

      const result = await escrow.approvals('test-escrow-1');

      expect(result.threshold).toBe(0);
      expect(result.signers).toEqual([]);
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

  describe('multi-sig conditionData decoding', () => {
    it('decodes signers and threshold from conditionData in status()', async () => {
      const signers = [
        getAddress('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
        getAddress('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'),
      ];
      const conditionData = encodeAbiParameters(
        [{ type: 'address[]' }, { type: 'uint256' }, { type: 'uint256' }],
        [signers, 2n, 3600n], // threshold=2, timeoutPerSigner=3600s
      );
      const rawEscrow = mockOnChainEscrow({
        conditionType: 1,
        conditionData,
        expiresAt: BigInt(Math.floor(Date.now() / 1000) + 7200),
      });
      mockContract.read.getEscrow.mockResolvedValue(rawEscrow);
      mockIdentityContract.read.get.mockResolvedValue({ actorType: 0 });

      const result = await escrow.status('test-escrow-1');

      expect(result.conditions.type).toBe('multi-sig');
      expect(result.conditions.multiSig).toBeDefined();
      expect(result.conditions.multiSig!.signers).toHaveLength(2);
      expect(result.conditions.multiSig!.threshold).toBe(2);
      expect(result.conditions.timeout).toBe('3600s');
      expect(result.approvals).toBeDefined();
      expect(result.approvals!.threshold).toBe(2);
    });
  });

  describe('identity resolution', () => {
    it('resolves depositor type from identity contract', async () => {
      const rawEscrow = mockOnChainEscrow();
      mockIdentityContract.read.resolve
        .mockResolvedValueOnce(toBytes32('depositor-id'))
        .mockResolvedValueOnce(toBytes32('beneficiary-id'));
      mockContract.write.create.mockResolvedValue('0xtxhash' as `0x${string}`);
      mockContract.read.getEscrow.mockResolvedValue(rawEscrow);
      // depositor = human (1), recipient = service (3)
      mockIdentityContract.read.get
        .mockResolvedValueOnce({ actorType: 1 })
        .mockResolvedValueOnce({ actorType: 3 });

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

      expect(result.depositor.type).toBe('human');
      expect(result.recipient.type).toBe('service');
    });

    it('falls back to agent when identity contract throws', async () => {
      const rawEscrow = mockOnChainEscrow();
      mockIdentityContract.read.resolve
        .mockResolvedValueOnce(toBytes32('depositor-id'))
        .mockResolvedValueOnce(toBytes32('beneficiary-id'));
      mockContract.write.create.mockResolvedValue('0xtxhash' as `0x${string}`);
      mockContract.read.getEscrow.mockResolvedValue(rawEscrow);
      mockIdentityContract.read.get.mockRejectedValue(new Error('not found'));

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

      expect(result.depositor.type).toBe('agent');
      expect(result.recipient.type).toBe('agent');
    });
  });

  describe('onStateChange()', () => {
    it('calls watchContractEvent and returns unsubscribe function', () => {
      const callback = vi.fn();
      const unsubscribe = escrow.onStateChange('test-escrow-1', callback);

      expect(mockPublicClient.watchContractEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          abi: expect.any(Array),
          args: { escrowId: toBytes32('test-escrow-1') },
          onLogs: expect.any(Function),
        }),
      );
      expect(typeof unsubscribe).toBe('function');
    });

    it('invokes callback when relevant event logs are received', () => {
      const callback = vi.fn();

      // Capture the onLogs handler
      let capturedOnLogs: ((logs: unknown[]) => void) | undefined;
      mockPublicClient.watchContractEvent.mockImplementation((opts: { onLogs: (logs: unknown[]) => void }) => {
        capturedOnLogs = opts.onLogs;
        return () => { /* unwatch */ };
      });

      escrow.onStateChange('test-escrow-1', callback);

      // Build a mock EscrowFunded event log
      const topics = encodeEventTopics({
        abi: InvarianceEscrowAbi as Abi,
        eventName: 'EscrowFunded',
        args: {
          escrowId: toBytes32('test-escrow-1'),
          funder: '0x1111111111111111111111111111111111111111' as `0x${string}`,
        },
      });
      const data = encodeAbiParameters(
        [{ type: 'uint256' }],
        [250000000n],
      );

      // Simulate receiving the log
      capturedOnLogs!([{
        data,
        topics,
        transactionHash: '0xfundedhash',
      }]);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          escrowId: 'test-escrow-1',
          newState: 'funded',
          txHash: '0xfundedhash',
        }),
      );
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
