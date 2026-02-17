/**
 * Re-exports and module-specific types for the Marketplace module.
 */
export type {
  RegisterListingOptions,
  Listing,
  ListingCategory,
  PricingModel,
  SearchQuery,
  SearchResults,
  HireOptions,
  HireResult,
  CompletionResult,
  TxReceipt,
} from '@invariance/common';

/** Options for updating a marketplace listing */
export interface UpdateListingOptions {
  name?: string;
  description?: string;
  category?: import('@invariance/common').ListingCategory;
  pricing?: import('@invariance/common').PricingModel;
  capabilities?: string[];
  tags?: string[];
  avatar?: string;
  apiEndpoint?: string;
  sla?: {
    maxResponseTime: string;
    uptime: number;
    refundPolicy: string;
  };
}

/** Options for querying featured listings */
export interface FeaturedOptions {
  category?: import('@invariance/common').ListingCategory;
  limit?: number;
}

/** Options for completing a hire */
export interface CompleteHireOptions {
  review?: Omit<import('@invariance/common').SubmitReviewOptions, 'target' | 'escrowId'>;
  deliverables?: string[];
  notes?: string;
}
