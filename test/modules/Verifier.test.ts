import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ErrorCode } from '@invariance/common';
import { Verifier } from '../../src/modules/verify/Verifier.js';
import { InvarianceError } from '../../src/errors/InvarianceError.js';
import {
  createMockContractFactory,
  createMockContract,
  createMockPublicClient,
  createEventEmitter,
  createTelemetry,
  createMockEntryLoggedLog,
  createMockIntentRequestedLog,
} from '../fixtures/mocks.js';
import type { Telemetry } from '../../src/core/Telemetry.js';
import type { ContractFactory } from '../../src/core/ContractFactory.js';
import { toBytes32 } from '../../src/utils/contract-helpers.js';

describe('Verifier', () => {
  let factory: ContractFactory;
  let mockLedgerContract: ReturnType<typeof createMockContract>;
  let mockIdentityContract: ReturnType<typeof createMockContract>;
  let mockEscrowContract: ReturnType<typeof createMockContract>;
  let mockPublicClient: ReturnType<typeof createMockPublicClient>;
  let telemetry: Telemetry;
  let verifier: Verifier;

  beforeEach(() => {
    mockLedgerContract = createMockContract({
      read: {
        getEntry: vi.fn(),
        getEntryByProof: vi.fn(),
      },
    });

    mockIdentityContract = createMockContract({
      read: {
        resolve: vi.fn(),
        get: vi.fn(),
        getAttestations: vi.fn(),
      },
    });

    mockEscrowContract = createMockContract({
      read: {
        getEscrow: vi.fn(),
      },
    });

    mockPublicClient = createMockPublicClient();
    factory = createMockContractFactory({ contract: mockLedgerContract, publicClient: mockPublicClient });

    const getContractSpy = vi.mocked(factory.getContract);
    getContractSpy.mockImplementation((name: string) => {
      if (name === 'identity') return mockIdentityContract as ReturnType<ContractFactory['getContract']>;
      if (name === 'escrow') return mockEscrowContract as ReturnType<ContractFactory['getContract']>;
      return mockLedgerContract as ReturnType<ContractFactory['getContract']>;
    });

    telemetry = createTelemetry();
    verifier = new Verifier(factory, createEventEmitter(), telemetry);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('verify()', () => {
    it('fetches receipt, parses logs, and returns VerificationResult', async () => {
      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        transactionHash: '0xabc123' as `0x${string}`,
        blockNumber: 100n,
        gasUsed: 21000n,
        status: 'success' as const,
        logs: [createMockEntryLoggedLog(toBytes32('entry-1'))],
      });

      mockLedgerContract.read.getEntry.mockResolvedValue({
        entryId: toBytes32('entry-1'),
        actorIdentityId: toBytes32('actor-id'),
        actorType: 0,
        actorAddress: '0x1111111111111111111111111111111111111111',
        action: 'swap',
        category: 'custom',
        metadataHash: toBytes32('meta'),
        proofHash: toBytes32('proof'),
        actorSignature: '0xactorsig1234567890',
        platformSignature: '0xplatformsig1234567890',
        severity: 0,
        blockNumber: 100n,
        timestamp: 1700000000n,
      });

      const result = await verifier.verify('0xabc123');

      expect(result.verified).toBe(true);
      expect(result.txHash).toBe('0xabc123');
      expect(result.action).toBe('swap');
      expect(result.actor.type).toBe('agent');
      expect(result.actor.address).toBe('0x1111111111111111111111111111111111111111');
      expect(result.proof.signatures.valid).toBe(true);
      expect(result.explorerUrl).toContain('/tx/');
    });

    it('throws VERIFICATION_FAILED for reverted transaction', async () => {
      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        transactionHash: '0xreverted' as `0x${string}`,
        blockNumber: 100n,
        gasUsed: 21000n,
        status: 'reverted' as const,
        logs: [],
      });

      await expect(verifier.verify('0xreverted')).rejects.toThrow(InvarianceError);
      await expect(verifier.verify('0xreverted')).rejects.toMatchObject({
        code: ErrorCode.VERIFICATION_FAILED,
      });
    });

    it('throws VERIFICATION_FAILED when no Invariance events found', async () => {
      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        transactionHash: '0xnoevents' as `0x${string}`,
        blockNumber: 100n,
        gasUsed: 21000n,
        status: 'success' as const,
        logs: [{ topics: ['0xunknownevent'], data: '0x' }],
      });

      await expect(verifier.verify('0xnoevents')).rejects.toThrow(InvarianceError);
    });

    it('handles missing ledger entry gracefully (falls through to intent events)', async () => {
      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        transactionHash: '0xabc123' as `0x${string}`,
        blockNumber: 100n,
        gasUsed: 21000n,
        status: 'success' as const,
        logs: [createMockIntentRequestedLog(toBytes32('intent-1'))],
      });

      mockLedgerContract.read.getEntry.mockRejectedValue(new Error('not found'));

      const result = await verifier.verify('0xabc123');

      // With no ledger entry, verification should fail (entry is required for verified: true)
      expect(result.verified).toBe(false);
      expect(result.txHash).toBe('0xabc123');
    });
  });

  describe('action()', () => {
    it('throws VERIFICATION_FAILED when indexer unavailable and no match', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')));

      await expect(
        verifier.action({ actor: '0x1111111111111111111111111111111111111111', action: 'swap' }),
      ).rejects.toThrow(InvarianceError);
    });

    it('delegates to verify() when indexer returns a match', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn()
          .mockResolvedValueOnce({ ok: true }) // health
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve([{ txHash: '0xmatch123' }]),
          }),
      );

      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        transactionHash: '0xmatch123' as `0x${string}`,
        blockNumber: 100n,
        gasUsed: 21000n,
        status: 'success' as const,
        logs: [createMockEntryLoggedLog(toBytes32('entry-1'))],
      });
      mockLedgerContract.read.getEntry.mockResolvedValue({
        entryId: toBytes32('entry-1'),
        actorType: 0,
        actorAddress: '0x1111111111111111111111111111111111111111',
        action: 'swap',
        category: 'custom',
        metadataHash: toBytes32(''),
        proofHash: toBytes32(''),
        actorSignature: '0xsig',
        platformSignature: '0xsig',
        severity: 0,
        blockNumber: 100n,
        timestamp: 1700000000n,
      });

      const result = await verifier.action({
        actor: '0x1111111111111111111111111111111111111111',
        action: 'swap',
      });

      expect(result.verified).toBe(true);
    });
  });

  describe('identity()', () => {
    it('returns full identity audit', async () => {
      mockIdentityContract.read.resolve.mockResolvedValue(toBytes32('id-1'));
      mockIdentityContract.read.get.mockResolvedValue({
        identityId: toBytes32('id-1'),
        actorType: 0,
        owner: '0x1111111111111111111111111111111111111111',
        walletAddress: '0x1111111111111111111111111111111111111111',
        label: 'TestAgent',
        capabilities: ['swap', 'transfer'],
        status: 0,
        attestationCount: 2n,
        createdAt: 1700000000n,
      });
      mockIdentityContract.read.getAttestations.mockResolvedValue([]);
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')));

      const result = await verifier.identity('0x1111111111111111111111111111111111111111');

      expect(result.identity.label).toBe('TestAgent');
      expect(result.identity.type).toBe('agent');
      expect(result.identity.capabilities).toContain('swap');
      expect(result.explorerUrl).toContain('/identity/');
    });
  });

  describe('escrow()', () => {
    it('returns escrow audit trail', async () => {
      mockEscrowContract.read.getEscrow.mockResolvedValue({
        escrowId: toBytes32('esc-1'),
        depositorIdentityId: toBytes32('dep-id'),
        beneficiaryIdentityId: toBytes32('ben-id'),
        depositor: '0x1111111111111111111111111111111111111111',
        beneficiary: '0x2222222222222222222222222222222222222222',
        amount: 500000000n, // 500 USDC
        fundedAmount: 500000000n,
        conditionType: 0,
        conditionData: '0x',
        state: 1, // funded
        createdAt: 1700000000n,
        expiresAt: 1700172800n,
        releasedAt: 0n,
      });
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')));

      const result = await verifier.escrow('esc-1');

      expect(result.escrowId).toBe('esc-1');
      expect(result.amount).toBe('500.000000');
      expect(result.finalState).toBe('funded');
      expect(result.depositor.address).toBe('0x1111111111111111111111111111111111111111');
      expect(result.recipient.address).toBe('0x2222222222222222222222222222222222222222');
      expect(result.timeline.length).toBeGreaterThan(0);
    });

    it('throws ESCROW_NOT_FOUND for non-existent escrow', async () => {
      mockEscrowContract.read.getEscrow.mockResolvedValue({
        escrowId: toBytes32(''),
        depositor: '0x0000000000000000000000000000000000000000',
        beneficiary: '0x0000000000000000000000000000000000000000',
        amount: 0n,
        fundedAmount: 0n,
        conditionType: 0,
        conditionData: '0x',
        state: 0,
        createdAt: 0n,
        expiresAt: 0n,
        releasedAt: 0n,
      });

      await expect(verifier.escrow('nonexistent')).rejects.toThrow(InvarianceError);
    });
  });

  describe('proof()', () => {
    it('throws VERIFICATION_FAILED when proof not found', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')));
      mockLedgerContract.read.getEntryByProof.mockRejectedValue(new Error('not found'));

      await expect(verifier.proof('0xdeadbeef')).rejects.toThrow(InvarianceError);
    });
  });

  describe('bulk()', () => {
    it('processes array and returns results for each hash', async () => {
      // First hash succeeds, second fails
      mockPublicClient.waitForTransactionReceipt
        .mockResolvedValueOnce({
          transactionHash: '0xsuccess' as `0x${string}`,
          blockNumber: 100n,
          gasUsed: 21000n,
          status: 'success' as const,
          logs: [createMockEntryLoggedLog(toBytes32('entry-1'))],
        })
        .mockResolvedValueOnce({
          transactionHash: '0xfail' as `0x${string}`,
          blockNumber: 100n,
          gasUsed: 21000n,
          status: 'reverted' as const,
          logs: [],
        });

      mockLedgerContract.read.getEntry.mockResolvedValue({
        entryId: toBytes32('entry-1'),
        actorType: 0,
        actorAddress: '0x1111111111111111111111111111111111111111',
        action: 'swap',
        category: 'custom',
        metadataHash: toBytes32(''),
        proofHash: toBytes32(''),
        actorSignature: '0xsig',
        platformSignature: '0xsig',
        severity: 0,
        blockNumber: 100n,
        timestamp: 1700000000n,
      });

      const results = await verifier.bulk(['0xsuccess', '0xfail']);

      expect(results).toHaveLength(2);
      expect(results[0]!.verified).toBe(true);
      expect(results[1]!.verified).toBe(false);
    });

    it('returns empty array for empty input', async () => {
      const results = await verifier.bulk([]);
      expect(results).toEqual([]);
    });
  });

  describe('url()', () => {
    it('returns correct explorer URL format', () => {
      const url = verifier.url('inv_int_abc123');
      expect(url).toBe('https://sepolia.basescan.org/v/inv_int_abc123');
    });
  });

  describe('telemetry', () => {
    it('tracks all method calls', async () => {
      const trackSpy = vi.spyOn(telemetry, 'track');

      verifier.url('test-id');
      expect(trackSpy).toHaveBeenCalledWith('verify.url');

      await verifier.bulk([]);
      expect(trackSpy).toHaveBeenCalledWith('verify.bulk', { count: 0 });
    });
  });
});
