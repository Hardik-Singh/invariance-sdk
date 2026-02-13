import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ErrorCode } from '@invariance/common';
import { encodeEventTopics, encodeAbiParameters, type Abi } from 'viem';
import { MarketplaceKit } from '../../src/modules/marketplace/MarketplaceKit.js';
import { InvarianceError } from '../../src/errors/InvarianceError.js';
import { InvarianceRegistryAbi } from '../../src/contracts/abis/index.js';
import {
  createMockContract,
  createMockPublicClient,
  createMockContractFactory,
  createEventEmitter,
  createTelemetry,
} from '../fixtures/mocks.js';
import type { InvarianceEventEmitter } from '../../src/core/EventEmitter.js';
import type { Telemetry } from '../../src/core/Telemetry.js';
import type { ContractFactory } from '../../src/core/ContractFactory.js';

/** Create a mock ListingRegistered event log */
function createMockListingRegisteredLog(listingId: `0x${string}`) {
  const topics = encodeEventTopics({
    abi: InvarianceRegistryAbi as Abi,
    eventName: 'ListingRegistered',
    args: {
      listingId,
      ownerIdentityId: '0x0000000000000000000000000000000000000000000000000000000000000001' as `0x${string}`,
      owner: '0x1111111111111111111111111111111111111111' as `0x${string}`,
    },
  });
  const data = encodeAbiParameters(
    [{ type: 'string' }, { type: 'uint8' }],
    ['ContentGenius Pro', 1],
  );
  return { topics: topics as readonly string[], data };
}

/** Sample on-chain listing tuple */
function createOnChainListing(overrides?: Partial<{
  listingId: `0x${string}`;
  ownerIdentityId: `0x${string}`;
  owner: `0x${string}`;
  name: string;
  description: string;
  category: number;
  pricingType: number;
  price: bigint;
  metadataUri: string;
  active: boolean;
  createdAt: bigint;
  updatedAt: bigint;
}>) {
  return {
    listingId: '0x' + 'ab'.repeat(32) as `0x${string}`,
    ownerIdentityId: '0x0000000000000000000000000000000000000000000000000000000000000001' as `0x${string}`,
    owner: '0x1111111111111111111111111111111111111111' as `0x${string}`,
    name: 'ContentGenius Pro',
    description: 'AI content writer',
    category: 1, // content
    pricingType: 2, // per-task
    price: 25000000n, // 25 USDC (6 decimals)
    metadataUri: JSON.stringify({ capabilities: ['blog-posts', 'seo-optimization'] }),
    active: true,
    createdAt: 1700000000n,
    updatedAt: 1700000000n,
    ...overrides,
  };
}

/** Mock on-chain hire struct */
function createOnChainHire(overrides?: Partial<{
  hireId: `0x${string}`;
  listingId: `0x${string}`;
  escrowId: `0x${string}`;
  policyId: `0x${string}`;
  hirer: `0x${string}`;
  provider: `0x${string}`;
  taskDescription: string;
  status: number;
  createdAt: bigint;
  completedAt: bigint;
}>) {
  return {
    hireId: '0x' + 'cd'.repeat(32) as `0x${string}`,
    listingId: '0x' + 'ab'.repeat(32) as `0x${string}`,
    escrowId: '0x' + 'ef'.repeat(32) as `0x${string}`,
    policyId: '0x' + '00'.repeat(32) as `0x${string}`,
    hirer: '0x2222222222222222222222222222222222222222' as `0x${string}`,
    provider: '0x1111111111111111111111111111111111111111' as `0x${string}`,
    taskDescription: 'Write blog post',
    status: 0, // Active
    createdAt: 1700000000n,
    completedAt: 0n,
    ...overrides,
  };
}

describe('MarketplaceKit', () => {
  let factory: ContractFactory;
  let mockRegistryContract: ReturnType<typeof createMockContract>;
  let mockEscrowContract: ReturnType<typeof createMockContract>;
  let mockPolicyContract: ReturnType<typeof createMockContract>;
  let mockReviewContract: ReturnType<typeof createMockContract>;
  let mockHireContract: ReturnType<typeof createMockContract>;
  let mockPublicClient: ReturnType<typeof createMockPublicClient>;
  let events: InvarianceEventEmitter;
  let telemetry: Telemetry;
  let marketplace: MarketplaceKit;

  const LISTING_ID = '0x' + Buffer.from('listing-1').toString('hex').padEnd(64, '0') as `0x${string}`;

  beforeEach(() => {
    mockRegistryContract = createMockContract({
      read: {
        getListing: vi.fn().mockResolvedValue(createOnChainListing()),
        getActiveListings: vi.fn().mockResolvedValue([]),
        getOwnerListings: vi.fn().mockResolvedValue([]),
      },
      write: {
        register: vi.fn().mockResolvedValue('0xtxhash1' as `0x${string}`),
        update: vi.fn().mockResolvedValue('0xtxhash2' as `0x${string}`),
        deactivate: vi.fn().mockResolvedValue('0xtxhash3' as `0x${string}`),
      },
    });

    mockEscrowContract = createMockContract({
      write: {
        create: vi.fn().mockResolvedValue('0xescrowtx' as `0x${string}`),
        release: vi.fn().mockResolvedValue('0xreleasetx' as `0x${string}`),
      },
    });

    mockPolicyContract = createMockContract({
      write: {
        create: vi.fn().mockResolvedValue('0xpolicytx' as `0x${string}`),
      },
    });

    mockReviewContract = createMockContract({
      write: {
        submit: vi.fn().mockResolvedValue('0xreviewtx' as `0x${string}`),
      },
    });

    mockHireContract = createMockContract({
      read: {
        getHire: vi.fn().mockResolvedValue(createOnChainHire()),
      },
      write: {
        create: vi.fn().mockResolvedValue('0xhiretx' as `0x${string}`),
        complete: vi.fn().mockResolvedValue('0xhirecompletetx' as `0x${string}`),
      },
    });

    const listingLog = createMockListingRegisteredLog(LISTING_ID);
    mockPublicClient = createMockPublicClient({
      receipt: {
        transactionHash: '0xabc123' as `0x${string}`,
        blockNumber: 100n,
        gasUsed: 21000n,
        status: 'success',
        logs: [listingLog],
      },
    });

    factory = createMockContractFactory({ contract: mockRegistryContract, publicClient: mockPublicClient });

    // Override getContract to return different mocks per contract name
    vi.spyOn(factory, 'getContract').mockImplementation((name: string) => {
      switch (name) {
        case 'registry': return mockRegistryContract as ReturnType<ContractFactory['getContract']>;
        case 'escrow': return mockEscrowContract as ReturnType<ContractFactory['getContract']>;
        case 'policy': return mockPolicyContract as ReturnType<ContractFactory['getContract']>;
        case 'review': return mockReviewContract as ReturnType<ContractFactory['getContract']>;
        case 'hire': return mockHireContract as ReturnType<ContractFactory['getContract']>;
        default: return mockRegistryContract as ReturnType<ContractFactory['getContract']>;
      }
    });

    events = createEventEmitter();
    telemetry = createTelemetry();
    marketplace = new MarketplaceKit(factory, events, telemetry);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('register()', () => {
    it('registers a listing on-chain and returns the created listing', async () => {
      const listing = await marketplace.register({
        identity: 'identity-1',
        name: 'ContentGenius Pro',
        description: 'AI content writer',
        category: 'content',
        pricing: { type: 'per-task', amount: '25.00', currency: 'USDC' },
        capabilities: ['blog-posts', 'seo-optimization'],
      });

      expect(listing.name).toBe('ContentGenius Pro');
      expect(listing.category).toBe('content');
      expect(listing.active).toBe(true);
      expect(mockRegistryContract.write['register']).toHaveBeenCalled();
      expect(mockRegistryContract.read['getListing']).toHaveBeenCalledWith([LISTING_ID]);
    });

    it('emits marketplace.listed event after successful registration', async () => {
      const emitSpy = vi.spyOn(events, 'emit');

      await marketplace.register({
        identity: 'identity-1',
        name: 'Test Agent',
        description: 'Test description',
        category: 'content',
        pricing: { type: 'per-task', amount: '10.00', currency: 'USDC' },
        capabilities: [],
      });

      expect(emitSpy).toHaveBeenCalledWith('marketplace.listed', expect.objectContaining({
        listingId: expect.any(String),
      }));
    });

    it('tracks telemetry with category', async () => {
      const trackSpy = vi.spyOn(telemetry, 'track');

      await marketplace.register({
        identity: 'identity-1',
        name: 'Test Agent',
        description: 'Test',
        category: 'trading',
        pricing: { type: 'per-task', amount: '5.00', currency: 'USDC' },
        capabilities: [],
      });

      expect(trackSpy).toHaveBeenCalledWith('marketplace.register', { category: 'trading' });
    });

    it('throws INVALID_INPUT for empty name', async () => {
      await expect(
        marketplace.register({
          identity: 'id-1',
          name: '',
          description: 'Desc',
          category: 'content',
          pricing: { type: 'per-task', amount: '10.00', currency: 'USDC' },
          capabilities: [],
        }),
      ).rejects.toMatchObject({
        code: ErrorCode.INVALID_INPUT,
        message: expect.stringContaining('empty'),
      });
    });

    it('throws INVALID_INPUT for negative price', async () => {
      await expect(
        marketplace.register({
          identity: 'id-1',
          name: 'Test',
          description: 'Desc',
          category: 'content',
          pricing: { type: 'subscription', amount: '-10.00', currency: 'USDC' },
          capabilities: [],
        }),
      ).rejects.toMatchObject({
        code: ErrorCode.INVALID_INPUT,
        message: expect.stringContaining('Invalid price'),
      });
    });

    it('passes correct args to the registry contract', async () => {
      await marketplace.register({
        identity: 'identity-1',
        name: 'My Agent',
        description: 'Does things',
        category: 'automation',
        pricing: { type: 'fixed', amount: '100.00', currency: 'USDC' },
        capabilities: ['task-a'],
        tags: ['ai'],
      });

      const registerCall = mockRegistryContract.write['register']!.mock.calls[0]![0];
      // category: automation = 3, pricingType: fixed = 0
      expect(registerCall[3]).toBe(3); // category enum
      expect(registerCall[4]).toBe(0); // pricingType enum
      expect(registerCall[5]).toBe(100000000n); // 100 USDC in 6 decimals
    });
  });

  describe('update()', () => {
    it('merges fields and calls contract with correct args', async () => {
      const listing = await marketplace.update('listing-1', {
        name: 'Updated Name',
      });

      expect(listing.name).toBe('ContentGenius Pro'); // from mock getListing read-back
      expect(mockRegistryContract.write['update']).toHaveBeenCalled();
      const updateArgs = mockRegistryContract.write['update']!.mock.calls[0]![0];
      expect(updateArgs[1]).toBe('Updated Name');
    });

    it('tracks telemetry', async () => {
      const trackSpy = vi.spyOn(telemetry, 'track');

      await marketplace.update('listing-1', { name: 'New Name' });

      expect(trackSpy).toHaveBeenCalledWith('marketplace.update');
    });

    it('preserves existing fields when not provided in update', async () => {
      await marketplace.update('listing-1', { description: 'New desc' });

      const updateArgs = mockRegistryContract.write['update']!.mock.calls[0]![0];
      expect(updateArgs[1]).toBe('ContentGenius Pro'); // name preserved from existing
      expect(updateArgs[2]).toBe('New desc'); // description updated
    });
  });

  describe('deactivate()', () => {
    it('calls deactivate on contract and returns receipt', async () => {
      const receipt = await marketplace.deactivate('listing-1');

      expect(receipt.status).toBe('success');
      expect(receipt.txHash).toBe('0xabc123');
      expect(mockRegistryContract.write['deactivate']).toHaveBeenCalled();
    });

    it('tracks telemetry', async () => {
      const trackSpy = vi.spyOn(telemetry, 'track');

      await marketplace.deactivate('listing-1');

      expect(trackSpy).toHaveBeenCalledWith('marketplace.deactivate');
    });
  });

  describe('search()', () => {
    it('returns empty results when indexer unavailable', async () => {
      // Indexer unavailable by default (fetch not mocked)
      const result = await marketplace.search({
        category: 'trading',
      });

      expect(result.listings).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.facets).toBeDefined();
    });

    it('uses default page 1 when page not provided', async () => {
      const result = await marketplace.search({ category: 'content' });

      expect(result.page).toBe(1);
    });

    it('returns provided page number', async () => {
      const result = await marketplace.search({
        category: 'content',
        page: 3,
      });

      expect(result.page).toBe(3);
    });

    it('includes facets in results', async () => {
      const result = await marketplace.search({ category: 'trading' });

      expect(result.facets).toEqual({
        categories: {},
        actorTypes: {},
        priceRange: { min: '0', max: '0' },
        avgRating: 0,
      });
    });

    it('tracks telemetry with category', async () => {
      const trackSpy = vi.spyOn(telemetry, 'track');

      await marketplace.search({ category: 'automation' });

      expect(trackSpy).toHaveBeenCalledWith('marketplace.search', { category: 'automation' });
    });

    it('tracks telemetry with undefined when no category', async () => {
      const trackSpy = vi.spyOn(telemetry, 'track');

      await marketplace.search({});

      expect(trackSpy).toHaveBeenCalledWith('marketplace.search', { category: undefined });
    });
  });

  describe('get()', () => {
    it('falls back to on-chain when indexer unavailable', async () => {
      const listing = await marketplace.get('listing-1');

      expect(listing.name).toBe('ContentGenius Pro');
      expect(listing.category).toBe('content');
      expect(mockRegistryContract.read['getListing']).toHaveBeenCalled();
    });

    it('throws when listing not found on-chain (zero owner)', async () => {
      mockRegistryContract.read['getListing']!.mockResolvedValue(
        createOnChainListing({ owner: '0x0000000000000000000000000000000000000000' as `0x${string}` }),
      );

      await expect(
        marketplace.get('nonexistent'),
      ).rejects.toMatchObject({
        code: ErrorCode.INVALID_INPUT,
        message: expect.stringContaining('Listing not found'),
      });
    });

    it('tracks telemetry', async () => {
      const trackSpy = vi.spyOn(telemetry, 'track');

      await marketplace.get('listing-1');

      expect(trackSpy).toHaveBeenCalledWith('marketplace.get');
    });
  });

  describe('featured()', () => {
    it('returns empty array when indexer unavailable', async () => {
      const result = await marketplace.featured();

      expect(result).toEqual([]);
    });

    it('supports category filter', async () => {
      const result = await marketplace.featured({ category: 'trading' });

      expect(result).toEqual([]);
    });

    it('supports limit parameter', async () => {
      const result = await marketplace.featured({ limit: 5 });

      expect(result).toEqual([]);
    });

    it('tracks telemetry with category', async () => {
      const trackSpy = vi.spyOn(telemetry, 'track');

      await marketplace.featured({ category: 'content' });

      expect(trackSpy).toHaveBeenCalledWith('marketplace.featured', { category: 'content' });
    });

    it('tracks telemetry with undefined when no options', async () => {
      const trackSpy = vi.spyOn(telemetry, 'track');

      await marketplace.featured();

      expect(trackSpy).toHaveBeenCalledWith('marketplace.featured', { category: undefined });
    });
  });

  describe('hire()', () => {
    it('creates escrow, records hire on-chain, and returns HireResult', async () => {
      const result = await marketplace.hire({
        listingId: 'listing-1',
        task: { description: 'Write blog post', deadline: '2025-12-31' },
        payment: { amount: '25.00', type: 'escrow' },
      });

      expect(result.status).toBe('active');
      expect(result.listing.name).toBe('ContentGenius Pro');
      expect(mockEscrowContract.write['create']).toHaveBeenCalled();
      expect(mockHireContract.write['create']).toHaveBeenCalled();
    });

    it('creates policy when opts.policy provided', async () => {
      await marketplace.hire({
        listingId: 'listing-1',
        task: { description: 'Complex task', deadline: '2025-12-31' },
        payment: { amount: '100.00', type: 'escrow' },
        policy: {},
      });

      expect(mockPolicyContract.write['create']).toHaveBeenCalled();
      expect(mockHireContract.write['create']).toHaveBeenCalled();
    });

    it('does not create policy when opts.policy not provided', async () => {
      await marketplace.hire({
        listingId: 'listing-1',
        task: { description: 'Simple task', deadline: '2025-12-31' },
        payment: { amount: '10.00', type: 'escrow' },
      });

      expect(mockPolicyContract.write['create']).not.toHaveBeenCalled();
    });

    it('emits marketplace.hired event', async () => {
      const emitSpy = vi.spyOn(events, 'emit');

      await marketplace.hire({
        listingId: 'listing-1',
        task: { description: 'Test task', deadline: '2025-12-31' },
        payment: { amount: '10.00', type: 'escrow' },
      });

      expect(emitSpy).toHaveBeenCalledWith('marketplace.hired', expect.objectContaining({
        listingId: 'listing-1',
      }));
    });

    it('tracks telemetry', async () => {
      const trackSpy = vi.spyOn(telemetry, 'track');

      await marketplace.hire({
        listingId: 'listing-1',
        task: { description: 'Task', deadline: '2025-12-31' },
        payment: { amount: '5.00', type: 'escrow' },
      });

      expect(trackSpy).toHaveBeenCalledWith('marketplace.hire');
    });

    it('throws when listing is inactive', async () => {
      mockRegistryContract.read['getListing']!.mockResolvedValue(
        createOnChainListing({ active: false }),
      );

      await expect(
        marketplace.hire({
          listingId: 'listing-1',
          task: { description: 'Task', deadline: '2025-12-31' },
          payment: { amount: '10.00', type: 'escrow' },
        }),
      ).rejects.toMatchObject({
        message: expect.stringContaining('not active'),
      });
    });
  });

  describe('complete()', () => {
    it('reads hire from chain, completes hire, releases escrow, and returns CompletionResult', async () => {
      const result = await marketplace.complete('hire-1');

      expect(result.escrowReleased).toBe(true);
      expect(result.hireId).toBe('hire-1');
      expect(mockHireContract.read['getHire']).toHaveBeenCalled();
      expect(mockHireContract.write['complete']).toHaveBeenCalled();
      expect(mockEscrowContract.write['release']).toHaveBeenCalled();
    });

    it('submits review when provided', async () => {
      await marketplace.complete('hire-1', {
        review: {
          rating: 5,
          comment: 'Excellent work!',
        },
      });

      expect(mockReviewContract.write['submit']).toHaveBeenCalled();
    });

    it('does not submit review when not provided', async () => {
      await marketplace.complete('hire-1');

      expect(mockReviewContract.write['submit']).not.toHaveBeenCalled();
    });

    it('tracks telemetry without review', async () => {
      const trackSpy = vi.spyOn(telemetry, 'track');

      await marketplace.complete('hire-1');

      expect(trackSpy).toHaveBeenCalledWith('marketplace.complete', { hasReview: false });
    });

    it('tracks telemetry with review', async () => {
      const trackSpy = vi.spyOn(telemetry, 'track');

      await marketplace.complete('hire-1', {
        review: {
          rating: 5,
          comment: 'Excellent work!',
        },
      });

      expect(trackSpy).toHaveBeenCalledWith('marketplace.complete', { hasReview: true });
    });
  });

  describe('getHire()', () => {
    it('reads hire from on-chain contract', async () => {
      const hire = await marketplace.getHire('hire-1');

      expect(hire.taskDescription).toBe('Write blog post');
      expect(hire.status).toBe(0);
      expect(mockHireContract.read['getHire']).toHaveBeenCalled();
    });
  });

  describe('getContractAddress()', () => {
    it('returns registry contract address', () => {
      vi.spyOn(factory, 'getAddress').mockReturnValue('0xRegistryAddr');

      const addr = marketplace.getContractAddress();

      expect(addr).toBe('0xRegistryAddr');
      expect(factory.getAddress).toHaveBeenCalledWith('registry');
    });
  });
});
