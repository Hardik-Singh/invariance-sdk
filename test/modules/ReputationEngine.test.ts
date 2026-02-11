import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ReputationEngine } from '../../src/modules/reputation/ReputationEngine.js';
import { InvarianceError } from '../../src/errors/InvarianceError.js';
import {
  createMockContractFactory,
  createMockContract,
  createMockPublicClient,
  createEventEmitter,
  createTelemetry,
  createMockReviewSubmittedLog,
} from '../fixtures/mocks.js';
import type { InvarianceEventEmitter } from '../../src/core/EventEmitter.js';
import type { Telemetry } from '../../src/core/Telemetry.js';
import type { ContractFactory } from '../../src/core/ContractFactory.js';
import { toBytes32 } from '../../src/utils/contract-helpers.js';

describe('ReputationEngine', () => {
  let factory: ContractFactory;
  let mockReviewContract: ReturnType<typeof createMockContract>;
  let mockIdentityContract: ReturnType<typeof createMockContract>;
  let mockPublicClient: ReturnType<typeof createMockPublicClient>;
  let events: InvarianceEventEmitter;
  let telemetry: Telemetry;
  let reputation: ReputationEngine;

  beforeEach(() => {
    mockReviewContract = createMockContract({
      read: {
        getStats: vi.fn(),
      },
      write: {
        submit: vi.fn(),
      },
    });

    mockIdentityContract = createMockContract({
      read: {
        resolve: vi.fn(),
        get: vi.fn(),
        getAttestations: vi.fn(),
      },
    });

    mockPublicClient = createMockPublicClient();
    factory = createMockContractFactory({ contract: mockReviewContract, publicClient: mockPublicClient });

    const getContractSpy = vi.mocked(factory.getContract);
    getContractSpy.mockImplementation((name: string) => {
      if (name === 'identity') return mockIdentityContract as ReturnType<ContractFactory['getContract']>;
      return mockReviewContract as ReturnType<ContractFactory['getContract']>;
    });

    vi.spyOn(factory, 'getWalletAddress').mockReturnValue('0x1111111111111111111111111111111111111111');

    events = createEventEmitter();
    telemetry = createTelemetry();
    reputation = new ReputationEngine(factory, events, telemetry);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('get()', () => {
    it('returns full reputation profile', async () => {
      mockIdentityContract.read.resolve.mockResolvedValue(toBytes32('target-id'));
      mockReviewContract.read.getStats.mockResolvedValue({
        totalReviews: 5n,
        totalRating: 23n,
        totalQuality: 20n,
        totalCommunication: 22n,
        totalSpeed: 21n,
        totalValue: 23n,
      });
      mockIdentityContract.read.get.mockResolvedValue({ attestations: 0 });
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')));

      const result = await reputation.get('0x2222222222222222222222222222222222222222');

      expect(result.scores).toBeDefined();
      expect(result.scores.reviewAverage).toBeCloseTo(4.6);
      expect(result.scores.reviewCount).toBe(5);
      expect(result.reviews).toBeDefined();
      expect(result.badge).toBeDefined();
      expect(result.explorerUrl).toContain('/reputation/');
    });
  });

  describe('review()', () => {
    it('submits on-chain review and emits event', async () => {
      const emitSpy = vi.spyOn(events, 'emit');
      mockIdentityContract.read.resolve
        .mockResolvedValueOnce(toBytes32('reviewer-id'))
        .mockResolvedValueOnce(toBytes32('target-id'));
      mockReviewContract.write.submit.mockResolvedValue('0xtxhash' as `0x${string}`);

      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        transactionHash: '0xtxhash' as `0x${string}`,
        blockNumber: 100n,
        gasUsed: 21000n,
        status: 'success' as const,
        logs: [createMockReviewSubmittedLog(toBytes32('review-1'))],
      });

      const result = await reputation.review({
        target: '0x2222222222222222222222222222222222222222',
        escrowId: 'escrow-1',
        rating: 5,
        comment: 'Excellent!',
      });

      expect(mockReviewContract.write.submit).toHaveBeenCalledOnce();
      expect(result.rating).toBe(5);
      expect(result.verified).toBe(true);
      expect(result.explorerUrl).toContain('/tx/');
      expect(emitSpy).toHaveBeenCalledWith('reputation.reviewed', expect.objectContaining({
        target: '0x2222222222222222222222222222222222222222',
        rating: 5,
      }));
    });

    it('defaults category ratings to overall rating', async () => {
      mockIdentityContract.read.resolve
        .mockResolvedValueOnce(toBytes32('reviewer-id'))
        .mockResolvedValueOnce(toBytes32('target-id'));
      mockReviewContract.write.submit.mockResolvedValue('0xtxhash' as `0x${string}`);

      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        transactionHash: '0xtxhash' as `0x${string}`,
        blockNumber: 100n,
        gasUsed: 21000n,
        status: 'success' as const,
        logs: [createMockReviewSubmittedLog(toBytes32('review-1'))],
      });

      await reputation.review({
        target: '0x2222222222222222222222222222222222222222',
        escrowId: 'escrow-1',
        rating: 4,
      });

      // The submit call should have received rating 4 for all categories
      const args = mockReviewContract.write.submit.mock.calls[0]![0] as unknown[];
      expect(args[3]).toBe(4); // overall rating
      expect(args[5]).toBe(4); // quality
      expect(args[6]).toBe(4); // communication
      expect(args[7]).toBe(4); // speed
      expect(args[8]).toBe(4); // value
    });
  });

  describe('score()', () => {
    it('calculates overall score from review stats and on-chain metrics', async () => {
      mockIdentityContract.read.resolve.mockResolvedValue(toBytes32('target-id'));
      mockReviewContract.read.getStats.mockResolvedValue({
        totalReviews: 10n,
        totalRating: 45n,
        totalQuality: 40n,
        totalCommunication: 42n,
        totalSpeed: 41n,
        totalValue: 43n,
      });
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')));

      const result = await reputation.score('0x2222222222222222222222222222222222222222');

      expect(result.overall).toBeGreaterThan(0);
      expect(result.reviewAverage).toBeCloseTo(4.5);
      expect(result.reviewCount).toBe(10);
      expect(result.tier).toBeDefined();
    });

    it('returns "unrated" tier for zero reviews', async () => {
      mockIdentityContract.read.resolve.mockResolvedValue(toBytes32('target-id'));
      mockReviewContract.read.getStats.mockResolvedValue({
        totalReviews: 0n,
        totalRating: 0n,
        totalQuality: 0n,
        totalCommunication: 0n,
        totalSpeed: 0n,
        totalValue: 0n,
      });
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')));

      const result = await reputation.score('0x2222222222222222222222222222222222222222');

      expect(result.reviewAverage).toBe(0);
      expect(result.tier).toBe('unrated');
    });
  });

  describe('compare()', () => {
    it('ranks addresses by overall score', async () => {
      mockIdentityContract.read.resolve.mockResolvedValue(toBytes32('id'));
      // First address: low reviews
      mockReviewContract.read.getStats
        .mockResolvedValueOnce({
          totalReviews: 1n, totalRating: 3n,
          totalQuality: 3n, totalCommunication: 3n, totalSpeed: 3n, totalValue: 3n,
        })
        // Second address: high reviews
        .mockResolvedValueOnce({
          totalReviews: 10n, totalRating: 48n,
          totalQuality: 45n, totalCommunication: 46n, totalSpeed: 47n, totalValue: 48n,
        });
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')));

      const result = await reputation.compare([
        '0x1111111111111111111111111111111111111111',
        '0x2222222222222222222222222222222222222222',
      ]);

      expect(result.identities).toHaveLength(2);
      expect(result.ranked).toHaveLength(2);
      // Second address should rank higher
      expect(result.ranked[0]).toBe('0x2222222222222222222222222222222222222222');
    });

    it('returns empty results on error', async () => {
      mockIdentityContract.read.resolve.mockRejectedValue(new Error('fail'));
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')));

      const result = await reputation.compare(['0xInvalid']);

      expect(result.identities).toEqual([]);
      expect(result.ranked).toEqual([]);
    });
  });

  describe('badge()', () => {
    it('returns null when no badge criteria met', async () => {
      mockIdentityContract.read.resolve.mockResolvedValue(toBytes32('id'));
      mockReviewContract.read.getStats.mockResolvedValue({
        totalReviews: 0n, totalRating: 0n,
        totalQuality: 0n, totalCommunication: 0n, totalSpeed: 0n, totalValue: 0n,
      });
      mockIdentityContract.read.get.mockResolvedValue({ attestations: 0 });
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')));

      const result = await reputation.badge('0x1111111111111111111111111111111111111111');

      expect(result).toBeNull();
    });

    it('returns "verified" badge when identity has attestations', async () => {
      mockIdentityContract.read.resolve.mockResolvedValue(toBytes32('id'));
      mockReviewContract.read.getStats.mockResolvedValue({
        totalReviews: 1n, totalRating: 4n,
        totalQuality: 4n, totalCommunication: 4n, totalSpeed: 4n, totalValue: 4n,
      });
      mockIdentityContract.read.get.mockResolvedValue({ attestations: 3 });
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')));

      const result = await reputation.badge('0x1111111111111111111111111111111111111111');

      expect(result).not.toBeNull();
      expect(result!.type).toBe('verified');
    });
  });

  describe('getReviews()', () => {
    it('returns empty list when indexer unavailable', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')));

      const result = await reputation.getReviews('0x1111111111111111111111111111111111111111');

      expect(result.reviews).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('history()', () => {
    it('returns empty history when indexer unavailable', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')));

      const result = await reputation.history('0x1111111111111111111111111111111111111111');

      expect(result.address).toBe('0x1111111111111111111111111111111111111111');
      expect(result.entries).toEqual([]);
    });
  });

  describe('getContractAddress()', () => {
    it('returns review contract address', () => {
      vi.spyOn(factory, 'getAddress').mockReturnValue('0xReviewAddr');
      const addr = reputation.getContractAddress();
      expect(addr).toBe('0xReviewAddr');
    });
  });
});
