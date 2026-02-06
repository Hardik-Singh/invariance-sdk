/**
 * Re-exports and module-specific types for the Marketplace Kit module.
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
} from '@invariance/common';

export type { TxReceipt } from '@invariance/common';

/** Options for updating a listing */
export interface UpdateListingOptions {
  name?: string;
  description?: string;
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

/** Options for getting featured listings */
export interface FeaturedOptions {
  category?: import('@invariance/common').ListingCategory;
  limit?: number;
}

/** Options for completing a hire */
export interface CompleteHireOptions {
  review?: {
    rating: 1 | 2 | 3 | 4 | 5;
    comment?: string;
    categories?: {
      quality?: 1 | 2 | 3 | 4 | 5;
      communication?: 1 | 2 | 3 | 4 | 5;
      speed?: 1 | 2 | 3 | 4 | 5;
      value?: 1 | 2 | 3 | 4 | 5;
    };
  };
}
