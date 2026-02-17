import type { ContractFactory } from '../../core/ContractFactory.js';
import type { InvarianceEventEmitter } from '../../core/EventEmitter.js';
import type { Telemetry } from '../../core/Telemetry.js';
import { ErrorCode } from '@invariance/common';
import type { ReputationScore, ReviewSummary } from '@invariance/common';
import { InvarianceError } from '../../errors/InvarianceError.js';
import {
  toBytes32,
  fromBytes32,
  waitForReceipt,
  mapContractError,
  listingCategoryToEnum,
  enumToListingCategory,
  pricingTypeToEnum,
  enumToPricingType,
  parseListingIdFromLogs,
} from '../../utils/contract-helpers.js';
import { IndexerClient } from '../../utils/indexer-client.js';
import { mapListingRow } from '../../utils/indexer-mappers.js';
import type {
  RegisterListingOptions,
  Listing,
  SearchQuery,
  SearchResults,
  HireOptions,
  HireResult,
  CompletionResult,
  TxReceipt,
  UpdateListingOptions,
  FeaturedOptions,
  CompleteHireOptions,
} from './types.js';

/** Shape of the on-chain Listing struct returned by getListing */
interface OnChainListing {
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
}

/** Default reputation for on-chain fallback (indexer provides enriched data) */
const DEFAULT_REPUTATION: ReputationScore = {
  overall: 0,
  reliability: 0,
  speed: 0,
  volume: 0,
  consistency: 0,
  policyCompliance: 0,
  reviewAverage: 0,
  reviewCount: 0,
  tier: 'unrated',
};

/** Default review summary for on-chain fallback */
const DEFAULT_REVIEW_SUMMARY: ReviewSummary = {
  average: 0,
  count: 0,
  distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
  recentReviews: [],
};

/**
 * Pre-built primitives for building verified marketplaces.
 *
 * The Marketplace Kit provides everything needed to build a marketplace
 * where any identity type can list services, be discovered, hired, and
 * reviewed. V1 focuses on AI agent marketplaces.
 *
 * The full flow: Register -> Search -> Hire -> Complete
 * Hiring automatically creates an escrow + policy in one call.
 *
 * @example
 * ```typescript
 * const listing = await inv.marketplace.register({
 *   identity: agent.identityId,
 *   name: 'ContentGenius Pro',
 *   description: 'AI content writer',
 *   category: 'content',
 *   pricing: { type: 'per-task', amount: '25.00', currency: 'USDC' },
 *   capabilities: ['blog-posts', 'seo-optimization'],
 * });
 * ```
 */
export class MarketplaceKit {
  private readonly contracts: ContractFactory;
  private readonly events: InvarianceEventEmitter;
  private readonly telemetry: Telemetry;
  private indexer: IndexerClient | null = null;

  constructor(
    contracts: ContractFactory,
    events: InvarianceEventEmitter,
    telemetry: Telemetry,
  ) {
    this.contracts = contracts;
    this.events = events;
    this.telemetry = telemetry;
  }

  /** Get the contract address for the registry module */
  getContractAddress(): string {
    return this.contracts.getAddress('registry');
  }

  /** Lazily initialize the indexer client */
  private getIndexer(): IndexerClient {
    if (!this.indexer) {
      this.indexer = new IndexerClient(this.contracts.getApiBaseUrl(), this.contracts.getApiKey());
    }
    return this.indexer;
  }

  /**
   * Map an on-chain listing tuple to the SDK Listing type.
   * Uses sensible defaults for reputation/reviews since the indexer provides enriched data.
   */
  private mapOnChainListing(raw: OnChainListing, txHash?: string): Listing {
    const explorerBase = this.contracts.getExplorerBaseUrl();
    const listingIdStr = fromBytes32(raw.listingId);
    const pricingType = enumToPricingType(raw.pricingType);

    // Parse metadata URI for extra fields
    let capabilities: string[] = [];
    let metadata: Record<string, unknown> = {};
    if (raw.metadataUri) {
      try {
        metadata = JSON.parse(raw.metadataUri) as Record<string, unknown>;
        if (Array.isArray(metadata['capabilities'])) {
          capabilities = metadata['capabilities'] as string[];
        }
      } catch {
        // Not JSON — treat as opaque URI
      }
    }

    return {
      listingId: listingIdStr || raw.listingId,
      identity: {
        identityId: fromBytes32(raw.ownerIdentityId) || raw.ownerIdentityId,
        type: 'agent',
        address: raw.owner,
        owner: raw.owner,
        label: raw.name,
        capabilities,
        status: raw.active ? 'active' : 'deactivated',
        attestations: 0,
        createdAt: Number(raw.createdAt),
        txHash: txHash ?? '',
        explorerUrl: `${explorerBase}/identity/${raw.ownerIdentityId}`,
      },
      name: raw.name,
      description: raw.description,
      category: enumToListingCategory(raw.category),
      pricing: {
        type: pricingType,
        amount: raw.price.toString(),
        currency: 'USDC',
      },
      capabilities,
      reputation: { ...DEFAULT_REPUTATION },
      reviewSummary: { ...DEFAULT_REVIEW_SUMMARY, recentReviews: [] },
      active: raw.active,
      createdAt: Number(raw.createdAt),
      txHash: txHash ?? '',
      explorerUrl: `${explorerBase}/listing/${raw.listingId}`,
    };
  }

  /**
   * Build a metadata URI JSON string from registration/update options.
   */
  private buildMetadataUri(opts: {
    capabilities?: string[];
    tags?: string[];
    avatar?: string;
    apiEndpoint?: string;
    sla?: { maxResponseTime: string; uptime: number; refundPolicy: string };
  }): string {
    const metadata: Record<string, unknown> = {};
    if (opts.capabilities?.length) metadata['capabilities'] = opts.capabilities;
    if (opts.tags?.length) metadata['tags'] = opts.tags;
    if (opts.avatar) metadata['avatar'] = opts.avatar;
    if (opts.apiEndpoint) metadata['apiEndpoint'] = opts.apiEndpoint;
    if (opts.sla) metadata['sla'] = opts.sla;
    return JSON.stringify(metadata);
  }

  /**
   * Register an identity on the marketplace.
   *
   * Creates a public listing with pricing, capabilities, and SLA details.
   * The listing is linked to the identity's on-chain reputation.
   *
   * @param opts - Listing registration options
   * @returns The created listing
   */
  async register(opts: RegisterListingOptions): Promise<Listing> {
    this.telemetry.track('marketplace.register', { category: opts.category });

    // Input validation
    if (!opts.name || opts.name.trim().length === 0) {
      throw new InvarianceError(
        ErrorCode.INVALID_INPUT,
        'Listing name cannot be empty',
      );
    }
    const priceNum = parseFloat(opts.pricing.amount);
    if (isNaN(priceNum) || priceNum <= 0) {
      throw new InvarianceError(
        ErrorCode.INVALID_INPUT,
        `Invalid price: ${opts.pricing.amount}. Must be a positive number.`,
      );
    }

    try {
      const contract = this.contracts.getContract('registry');
      const publicClient = this.contracts.getPublicClient();

      const identityId = toBytes32(opts.identity);
      const category = listingCategoryToEnum(opts.category);
      const pricingType = pricingTypeToEnum(opts.pricing.type);
      const price = BigInt(Math.round(priceNum * 1e6)); // USDC has 6 decimals
      const metadataUri = this.buildMetadataUri(opts);

      const registerFn = contract.write['register'];
      if (!registerFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'register function not found on contract');
      const txHash = await registerFn([identityId, opts.name, opts.description, category, pricingType, price, metadataUri]);

      const receipt = await waitForReceipt(publicClient, txHash);

      // Parse listing ID from event logs
      const listingId = parseListingIdFromLogs(receipt.logs);

      // Read back the full listing from chain
      const getListingFn = contract.read['getListing'];
      if (!getListingFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'getListing function not found on contract');
      const raw = await getListingFn([listingId]) as OnChainListing;

      const listing = this.mapOnChainListing(raw, receipt.txHash);

      this.events.emit('marketplace.listed', {
        listingId: listing.listingId,
      });

      return listing;
    } catch (err) {
      throw mapContractError(err);
    }
  }

  /**
   * Update listing details.
   *
   * @param listingId - The listing to update
   * @param opts - Fields to update
   * @returns The updated listing
   */
  async update(listingId: string, opts: UpdateListingOptions): Promise<Listing> {
    this.telemetry.track('marketplace.update');

    try {
      const contract = this.contracts.getContract('registry');
      const publicClient = this.contracts.getPublicClient();
      const listingIdBytes = toBytes32(listingId);

      // Fetch existing listing to merge unchanged fields
      const getListingFn = contract.read['getListing'];
      if (!getListingFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'getListing function not found on contract');
      const existing = await getListingFn([listingIdBytes]) as OnChainListing;

      const name = opts.name ?? existing.name;
      const description = opts.description ?? existing.description;
      const pricingType = opts.pricing
        ? pricingTypeToEnum(opts.pricing.type)
        : existing.pricingType;
      const price = opts.pricing
        ? BigInt(Math.round(parseFloat(opts.pricing.amount) * 1e6))
        : existing.price;

      // Merge metadata
      let existingMeta: Record<string, unknown> = {};
      if (existing.metadataUri) {
        try { existingMeta = JSON.parse(existing.metadataUri) as Record<string, unknown>; } catch { /* ignore */ }
      }
      const mergedMeta: Record<string, unknown> = { ...existingMeta };
      if (opts.capabilities) mergedMeta['capabilities'] = opts.capabilities;
      if (opts.tags) mergedMeta['tags'] = opts.tags;
      if (opts.avatar !== undefined) mergedMeta['avatar'] = opts.avatar;
      if (opts.apiEndpoint !== undefined) mergedMeta['apiEndpoint'] = opts.apiEndpoint;
      if (opts.sla) mergedMeta['sla'] = opts.sla;
      const metadataUri = JSON.stringify(mergedMeta);

      const updateFn = contract.write['update'];
      if (!updateFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'update function not found on contract');
      const txHash = await updateFn([listingIdBytes, name, description, pricingType, price, metadataUri]);

      await waitForReceipt(publicClient, txHash);

      // Read back updated listing
      const raw = await getListingFn([listingIdBytes]) as OnChainListing;
      return this.mapOnChainListing(raw, txHash);
    } catch (err) {
      throw mapContractError(err);
    }
  }

  /**
   * Deactivate a listing.
   *
   * The listing will no longer appear in search results but
   * existing hires remain active until completed.
   *
   * @param listingId - The listing to deactivate
   * @returns Transaction receipt
   */
  async deactivate(listingId: string): Promise<TxReceipt> {
    this.telemetry.track('marketplace.deactivate');

    try {
      const contract = this.contracts.getContract('registry');
      const publicClient = this.contracts.getPublicClient();
      const listingIdBytes = toBytes32(listingId);

      const deactivateFn = contract.write['deactivate'];
      if (!deactivateFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'deactivate function not found on contract');
      const txHash = await deactivateFn([listingIdBytes]);

      const receipt = await waitForReceipt(publicClient, txHash);

      return {
        txHash: receipt.txHash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        status: receipt.status,
      };
    } catch (err) {
      throw mapContractError(err);
    }
  }

  /**
   * Search and filter marketplace listings.
   *
   * Supports text search, category filtering, rating thresholds,
   * price ranges, and capability matching.
   *
   * @param query - Search query with filters
   * @returns Paginated search results with facets
   */
  async search(query: SearchQuery): Promise<SearchResults> {
    this.telemetry.track('marketplace.search', { category: query.category });

    const indexer = this.getIndexer();
    const available = await indexer.isAvailable();

    if (available) {
      try {
        const pageSize = Math.max(1, query.pageSize ?? 20);
        const page = Math.max(1, query.page ?? 1);
        const params: Record<string, string | number | undefined> = {
          search: query.text,
          category: query.category,
          maxPrice: query.maxPrice,
          page,
          pageSize,
        };

        const rows = await indexer.get<Record<string, unknown>[]>('/marketplace', params);
        const explorerBase = this.contracts.getExplorerBaseUrl();
        const listings = rows.map((row) => mapListingRow(row, explorerBase));

        const facets = listings.reduce((acc, listing) => {
          acc.categories[listing.category] = (acc.categories[listing.category] ?? 0) + 1;
          acc.actorTypes[listing.identity.type] = (acc.actorTypes[listing.identity.type] ?? 0) + 1;
          return acc;
        }, {
          categories: {} as Record<string, number>,
          actorTypes: {} as Record<string, number>,
          priceRange: { min: '0', max: '0' },
          avgRating: 0,
        });

        if (listings.length > 0) {
          const prices = listings.map((l) => Number(l.pricing.amount)).filter((n) => !Number.isNaN(n));
          const min = prices.length ? Math.min(...prices) : 0;
          const max = prices.length ? Math.max(...prices) : 0;
          facets.priceRange = { min: String(min), max: String(max) };
          const avg = listings.reduce((sum, l) => sum + (l.reputation.reviewAverage ?? 0), 0) / listings.length;
          facets.avgRating = Number.isNaN(avg) ? 0 : avg;
        }

        return {
          listings,
          total: listings.length,
          page,
          facets,
        };
      } catch {
        // Fall through to empty results
      }
    }

    return {
      listings: [],
      total: 0,
      page: query.page ?? 1,
      facets: {
        categories: {},
        actorTypes: {},
        priceRange: { min: '0', max: '0' },
        avgRating: 0,
      },
    };
  }

  /**
   * Get a single listing with full details.
   *
   * @param listingId - The listing ID
   * @returns The listing with reputation and reviews
   */
  async get(listingId: string): Promise<Listing> {
    this.telemetry.track('marketplace.get');

    // Try indexer first
    const indexer = this.getIndexer();
    const available = await indexer.isAvailable();

    if (available) {
      try {
        const row = await indexer.get<Record<string, unknown>>(`/marketplace/${listingId}`);
        return mapListingRow(row, this.contracts.getExplorerBaseUrl());
      } catch {
        // Fall through to on-chain
      }
    }

    // On-chain fallback
    try {
      const contract = this.contracts.getContract('registry');
      const listingIdBytes = toBytes32(listingId);

      const getListingFn = contract.read['getListing'];
      if (!getListingFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'getListing function not found on contract');
      const raw = await getListingFn([listingIdBytes]) as OnChainListing;

      // Verify listing exists (zero address means not found)
      if (raw.owner === '0x0000000000000000000000000000000000000000') {
        throw new InvarianceError(
          ErrorCode.INVALID_INPUT,
          `Listing not found: ${listingId}`,
        );
      }

      return this.mapOnChainListing(raw);
    } catch (err) {
      throw mapContractError(err);
    }
  }

  /**
   * Get top-rated listings by category.
   *
   * @param opts - Optional category and limit
   * @returns Array of featured listings
   */
  async featured(opts?: FeaturedOptions): Promise<Listing[]> {
    this.telemetry.track('marketplace.featured', { category: opts?.category });

    const indexer = this.getIndexer();
    const available = await indexer.isAvailable();

    if (available) {
      try {
        const params: Record<string, string | number | undefined> = {
          category: opts?.category,
          limit: opts?.limit,
        };
        const rows = await indexer.get<Record<string, unknown>[]>('/marketplace/featured', params);
        const explorerBase = this.contracts.getExplorerBaseUrl();
        return rows.map((row) => mapListingRow(row, explorerBase));
      } catch {
        // Fall through to empty
      }
    }

    return [];
  }

  /**
   * Hire from a listing.
   *
   * This is a compound operation that creates an escrow, policy, and
   * on-chain hire record in a single call. The escrow holds the payment,
   * the policy constrains what the hired identity can do, and the hire
   * contract records the agreement on-chain.
   *
   * @param opts - Hire options (listing, task, payment, policy)
   * @returns Hire result with escrow and policy IDs
   */
  async hire(opts: HireOptions): Promise<HireResult> {
    this.telemetry.track('marketplace.hire');

    try {
      // 1. Verify listing exists and is active
      const listing = await this.get(opts.listingId);
      if (!listing.active) {
        throw new InvarianceError(
          ErrorCode.INVALID_INPUT,
          `Listing is not active: ${opts.listingId}`,
        );
      }

      const publicClient = this.contracts.getPublicClient();
      const explorerBase = this.contracts.getExplorerBaseUrl();

      // 2. Create escrow
      const escrowContract = this.contracts.getContract('escrow');
      const identityId = toBytes32(listing.identity.identityId);
      const amount = BigInt(Math.round(parseFloat(opts.payment.amount) * 1e6));

      const createEscrowFn = escrowContract.write['create'];
      if (!createEscrowFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'create function not found on escrow contract');
      const escrowTxHash = await createEscrowFn([identityId, amount]);
      const escrowReceipt = await waitForReceipt(publicClient, escrowTxHash);
      const escrowId = fromBytes32(escrowReceipt.logs[0]?.topics[1] as `0x${string}` ?? '0x' + '00'.repeat(32) as `0x${string}`);

      // 3. Create policy if opts provided
      let policyId = '';
      if (opts.policy) {
        const policyContract = this.contracts.getContract('policy');
        const createPolicyFn = policyContract.write['create'];
        if (!createPolicyFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'create function not found on policy contract');
        const policyTxHash = await createPolicyFn([identityId]);
        const policyReceipt = await waitForReceipt(publicClient, policyTxHash);
        policyId = fromBytes32(policyReceipt.logs[0]?.topics[1] as `0x${string}` ?? '0x' + '00'.repeat(32) as `0x${string}`);
      }

      // 4. Record hire on-chain
      const hireContract = this.contracts.getContract('hire');
      const listingIdBytes = toBytes32(opts.listingId);
      const escrowIdBytes = toBytes32(escrowId);
      const policyIdBytes = toBytes32(policyId);

      const createHireFn = hireContract.write['create'];
      if (!createHireFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'create function not found on hire contract');
      const hireTxHash = await createHireFn([
        listingIdBytes,
        escrowIdBytes,
        policyIdBytes,
        listing.identity.address,
        opts.task.description,
      ]);
      const hireReceipt = await waitForReceipt(publicClient, hireTxHash);
      const hireId = fromBytes32(hireReceipt.logs[0]?.topics[1] as `0x${string}` ?? '0x' + '00'.repeat(32) as `0x${string}`);

      this.events.emit('marketplace.hired', {
        hireId,
        listingId: opts.listingId,
        hirer: this.contracts.getWalletAddress(),
        provider: listing.identity.address,
        escrowId,
        policyId,
      });

      return {
        hireId,
        escrowId,
        policyId,
        listing,
        status: 'active',
        explorerUrl: `${explorerBase}/hire/${hireId}`,
      };
    } catch (err) {
      throw mapContractError(err);
    }
  }

  /**
   * Complete a job and optionally leave a review.
   *
   * Marks the hire as completed on-chain, releases the escrow,
   * submits a review (if provided), and updates the identity's reputation.
   *
   * @param hireId - The hire to complete
   * @param opts - Completion options (optional review)
   * @returns Completion result with escrow and reputation updates
   */
  async complete(hireId: string, opts?: CompleteHireOptions): Promise<CompletionResult> {
    this.telemetry.track('marketplace.complete', { hasReview: opts?.review !== undefined });

    try {
      const publicClient = this.contracts.getPublicClient();
      const explorerBase = this.contracts.getExplorerBaseUrl();
      const hireIdBytes = toBytes32(hireId);

      // 1. Read hire from chain to get escrowId
      const hireContract = this.contracts.getContract('hire');
      const getHireFn = hireContract.read['getHire'];
      if (!getHireFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'getHire function not found on hire contract');
      const hire = await getHireFn([hireIdBytes]) as {
        escrowId: `0x${string}`;
        listingId: `0x${string}`;
        hirer: `0x${string}`;
        provider: `0x${string}`;
      };

      // 2. Mark hire as completed on-chain
      const completeFn = hireContract.write['complete'];
      if (!completeFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'complete function not found on hire contract');
      const completeTxHash = await completeFn([hireIdBytes]);
      await waitForReceipt(publicClient, completeTxHash);

      // 3. Release escrow
      const escrowContract = this.contracts.getContract('escrow');
      const releaseFn = escrowContract.write['release'];
      if (!releaseFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'release function not found on escrow contract');
      const releaseTxHash = await releaseFn([hire.escrowId]);
      await waitForReceipt(publicClient, releaseTxHash);

      // 4. Submit review if provided
      let reviewId = '';
      if (opts?.review) {
        const reviewContract = this.contracts.getContract('review');
        const submitFn = reviewContract.write['submit'];
        if (!submitFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'submit function not found on review contract');

        const reviewTxHash = await submitFn([
          hire.escrowId,
          opts.review.rating,
          opts.review.comment ?? '',
        ]);
        const reviewReceipt = await waitForReceipt(publicClient, reviewTxHash);
        reviewId = reviewReceipt.txHash;
      }

      this.events.emit('marketplace.hire.completed', {
        hireId,
        hirer: hire.hirer,
        provider: hire.provider,
        listingId: fromBytes32(hire.listingId),
        escrowId: fromBytes32(hire.escrowId),
        completedAt: Date.now(),
      });

      return {
        hireId,
        escrowReleased: true,
        reviewId,
        updatedReputation: { ...DEFAULT_REPUTATION },
        explorerUrl: `${explorerBase}/hire/${hireId}`,
      };
    } catch (err) {
      throw mapContractError(err);
    }
  }

  /**
   * Get a hire agreement from the on-chain contract.
   *
   * @param hireId - The hire ID
   * @returns The on-chain hire data
   */
  async getHire(hireId: string): Promise<{
    hireId: string;
    listingId: string;
    escrowId: string;
    policyId: string;
    hirer: string;
    provider: string;
    taskDescription: string;
    status: number;
    createdAt: number;
    completedAt: number;
  }> {
    const hireContract = this.contracts.getContract('hire');
    const getHireFn = hireContract.read['getHire'];
    if (!getHireFn) throw new InvarianceError(ErrorCode.NETWORK_ERROR, 'getHire function not found on hire contract');

    const hireIdBytes = toBytes32(hireId);
    const raw = await getHireFn([hireIdBytes]) as {
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
    };

    return {
      hireId: fromBytes32(raw.hireId),
      listingId: fromBytes32(raw.listingId),
      escrowId: fromBytes32(raw.escrowId),
      policyId: fromBytes32(raw.policyId),
      hirer: raw.hirer,
      provider: raw.provider,
      taskDescription: raw.taskDescription,
      status: raw.status,
      createdAt: Number(raw.createdAt),
      completedAt: Number(raw.completedAt),
    };
  }
}
