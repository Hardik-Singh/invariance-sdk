import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ErrorCode } from '@invariance/common';
import { MarketplaceKit } from '../../src/modules/marketplace/MarketplaceKit.js';
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

describe('MarketplaceKit', () => {
  let factory: ContractFactory;
  let mockRegistryContract: ReturnType<typeof createMockContract>;
  let mockPublicClient: ReturnType<typeof createMockPublicClient>;
  let events: InvarianceEventEmitter;
  let telemetry: Telemetry;
  let marketplace: MarketplaceKit;

  beforeEach(() => {
    mockRegistryContract = createMockContract({
      read: {
        getListing: vi.fn(),
        getListingsByCategory: vi.fn(),
      },
      write: {
        registerListing: vi.fn(),
        updateListing: vi.fn(),
        deactivateListing: vi.fn(),
      },
    });

    mockPublicClient = createMockPublicClient();
    factory = createMockContractFactory({ contract: mockRegistryContract, publicClient: mockPublicClient });

    events = createEventEmitter();
    telemetry = createTelemetry();
    marketplace = new MarketplaceKit(factory, events, telemetry);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('register()', () => {
    it('throws IDENTITY_NOT_FOUND for not yet implemented functionality', async () => {
      await expect(
        marketplace.register({
          identity: 'identity-1',
          name: 'ContentGenius Pro',
          description: 'AI content writer',
          category: 'content',
          pricing: { type: 'per-task', amount: '25.00', currency: 'USDC' },
          capabilities: ['blog-posts', 'seo-optimization'],
        }),
      ).rejects.toMatchObject({
        code: ErrorCode.IDENTITY_NOT_FOUND,
        message: expect.stringContaining('not yet implemented'),
      });
    });

    it('emits marketplace.listed event before throwing', async () => {
      const emitSpy = vi.spyOn(events, 'emit');

      await expect(
        marketplace.register({
          identity: 'identity-1',
          name: 'Test Agent',
          description: 'Test description',
          category: 'content',
          pricing: { type: 'per-task', amount: '10.00', currency: 'USDC' },
        }),
      ).rejects.toThrow();

      expect(emitSpy).toHaveBeenCalledWith('marketplace.listed', {
        listingId: 'pending',
      });
    });

    it('tracks telemetry with category', async () => {
      const trackSpy = vi.spyOn(telemetry, 'track');

      await expect(
        marketplace.register({
          identity: 'identity-1',
          name: 'Test Agent',
          description: 'Test',
          category: 'trading',
          pricing: { type: 'per-task', amount: '5.00', currency: 'USDC' },
        }),
      ).rejects.toThrow();

      expect(trackSpy).toHaveBeenCalledWith('marketplace.register', { category: 'trading' });
    });
  });

  describe('update()', () => {
    it('throws IDENTITY_NOT_FOUND for unknown listing', async () => {
      await expect(
        marketplace.update('listing-1', {
          name: 'Updated Name',
        }),
      ).rejects.toMatchObject({
        code: ErrorCode.IDENTITY_NOT_FOUND,
        message: expect.stringContaining('Listing not found'),
      });
    });

    it('tracks telemetry', async () => {
      const trackSpy = vi.spyOn(telemetry, 'track');

      await expect(
        marketplace.update('listing-1', { name: 'New Name' }),
      ).rejects.toThrow();

      expect(trackSpy).toHaveBeenCalledWith('marketplace.update');
    });
  });

  describe('deactivate()', () => {
    it('throws IDENTITY_NOT_FOUND for unknown listing', async () => {
      await expect(
        marketplace.deactivate('listing-1'),
      ).rejects.toMatchObject({
        code: ErrorCode.IDENTITY_NOT_FOUND,
        message: expect.stringContaining('Listing not found'),
      });
    });

    it('tracks telemetry', async () => {
      const trackSpy = vi.spyOn(telemetry, 'track');

      await expect(marketplace.deactivate('listing-1')).rejects.toThrow();

      expect(trackSpy).toHaveBeenCalledWith('marketplace.deactivate');
    });
  });

  describe('search()', () => {
    it('returns empty results when no listings found', async () => {
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

    it('supports text search query', async () => {
      const result = await marketplace.search({
        query: 'trading bot',
      });

      expect(result.listings).toEqual([]);
    });

    it('supports price range filter', async () => {
      const result = await marketplace.search({
        priceMin: '10.00',
        priceMax: '100.00',
      });

      expect(result.listings).toEqual([]);
    });

    it('supports rating filter', async () => {
      const result = await marketplace.search({
        minRating: 4,
      });

      expect(result.listings).toEqual([]);
    });

    it('supports capability matching', async () => {
      const result = await marketplace.search({
        capabilities: ['swap', 'transfer'],
      });

      expect(result.listings).toEqual([]);
    });

    it('supports pagination with limit', async () => {
      const result = await marketplace.search({
        page: 2,
        limit: 20,
      });

      expect(result.page).toBe(2);
      expect(result.listings).toEqual([]);
    });
  });

  describe('get()', () => {
    it('throws IDENTITY_NOT_FOUND for unknown listing', async () => {
      await expect(
        marketplace.get('nonexistent'),
      ).rejects.toMatchObject({
        code: ErrorCode.IDENTITY_NOT_FOUND,
        message: expect.stringContaining('Listing not found'),
      });
    });

    it('tracks telemetry', async () => {
      const trackSpy = vi.spyOn(telemetry, 'track');

      await expect(marketplace.get('listing-1')).rejects.toThrow();

      expect(trackSpy).toHaveBeenCalledWith('marketplace.get');
    });
  });

  describe('featured()', () => {
    it('returns empty array when no featured listings', async () => {
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
    it('throws ESCROW_NOT_FOUND for not yet implemented functionality', async () => {
      await expect(
        marketplace.hire({
          listingId: 'listing-1',
          task: 'Write blog post',
          payment: { amount: '25.00', currency: 'USDC' },
          policy: {
            capabilities: ['blog-posts'],
          },
        }),
      ).rejects.toMatchObject({
        code: ErrorCode.ESCROW_NOT_FOUND,
        message: expect.stringContaining('not yet implemented'),
      });
    });

    it('emits marketplace.hired event before throwing', async () => {
      const emitSpy = vi.spyOn(events, 'emit');

      await expect(
        marketplace.hire({
          listingId: 'listing-1',
          task: 'Test task',
          payment: { amount: '10.00', currency: 'USDC' },
        }),
      ).rejects.toThrow();

      expect(emitSpy).toHaveBeenCalledWith('marketplace.hired', {
        hireId: 'pending',
        listingId: 'listing-1',
      });
    });

    it('tracks telemetry', async () => {
      const trackSpy = vi.spyOn(telemetry, 'track');

      await expect(
        marketplace.hire({
          listingId: 'listing-1',
          task: 'Task',
          payment: { amount: '5.00', currency: 'USDC' },
        }),
      ).rejects.toThrow();

      expect(trackSpy).toHaveBeenCalledWith('marketplace.hire');
    });
  });

  describe('complete()', () => {
    it('throws ESCROW_NOT_FOUND for unknown hire', async () => {
      await expect(
        marketplace.complete('hire-1'),
      ).rejects.toMatchObject({
        code: ErrorCode.ESCROW_NOT_FOUND,
        message: expect.stringContaining('Hire not found'),
      });
    });

    it('tracks telemetry without review', async () => {
      const trackSpy = vi.spyOn(telemetry, 'track');

      await expect(marketplace.complete('hire-1')).rejects.toThrow();

      expect(trackSpy).toHaveBeenCalledWith('marketplace.complete', { hasReview: false });
    });

    it('tracks telemetry with review', async () => {
      const trackSpy = vi.spyOn(telemetry, 'track');

      await expect(
        marketplace.complete('hire-1', {
          review: {
            rating: 5,
            comment: 'Excellent work!',
          },
        }),
      ).rejects.toThrow();

      expect(trackSpy).toHaveBeenCalledWith('marketplace.complete', { hasReview: true });
    });

    it('accepts completion with review details', async () => {
      await expect(
        marketplace.complete('hire-1', {
          review: {
            rating: 4,
            comment: 'Good job',
            quality: 5,
            communication: 4,
            speed: 3,
            value: 4,
          },
        }),
      ).rejects.toThrow();
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

  describe('error handling', () => {
    it('handles invalid pricing configuration', async () => {
      await expect(
        marketplace.register({
          identity: 'id-1',
          name: 'Test',
          description: 'Desc',
          category: 'content',
          pricing: { type: 'subscription', amount: '-10.00', currency: 'USDC' },
        }),
      ).rejects.toThrow(InvarianceError);
    });

    it('handles missing required fields', async () => {
      await expect(
        marketplace.register({
          identity: 'id-1',
          name: '',
          description: 'Desc',
          category: 'content',
          pricing: { type: 'per-task', amount: '10.00', currency: 'USDC' },
        }),
      ).rejects.toThrow(InvarianceError);
    });
  });

  describe('compound operations', () => {
    it('hire creates escrow and policy in single call', async () => {
      await expect(
        marketplace.hire({
          listingId: 'listing-1',
          task: 'Complex task',
          payment: { amount: '100.00', currency: 'USDC' },
          policy: {
            capabilities: ['swap', 'transfer'],
            spendingLimit: '50.00',
            timeWindow: { start: Date.now(), end: Date.now() + 86400000 },
          },
        }),
      ).rejects.toThrow();
    });

    it('complete releases escrow and submits review', async () => {
      await expect(
        marketplace.complete('hire-1', {
          review: {
            rating: 5,
            comment: 'Perfect!',
          },
        }),
      ).rejects.toThrow();
    });
  });
});
