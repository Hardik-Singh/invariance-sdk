/**
 * NFT-gated template.
 */

import type { InvarianceTemplate } from '@invariance/common';
import { TemplateBuilder } from '../builder.js';

/**
 * Options for creating an NFT-gated template.
 */
export interface NFTGatedOptions {
  /** Template name */
  name?: string;
  /** NFT contract address */
  nftContract: string;
  /** Specific token ID required (optional) */
  tokenId?: bigint;
  /** Minimum NFTs required */
  minBalance?: number;
  /** NFT standard */
  standard?: 'erc721' | 'erc1155';
  /** Rate limit per holder */
  rateLimit?: {
    maxExecutions: number;
    windowSeconds: number;
  };
}

/**
 * Create an NFT-gated template requiring NFT ownership.
 *
 * @example
 * ```typescript
 * const template = createNFTGatedTemplate({
 *   nftContract: myNFTCollection,
 *   minBalance: 1,
 *   rateLimit: { maxExecutions: 10, windowSeconds: 86400 },
 * });
 * ```
 */
export function createNFTGatedTemplate(options: NFTGatedOptions): InvarianceTemplate {
  const builder = TemplateBuilder.create(options.name ?? 'nft-gated')
    .withDescription('Requires NFT ownership for access')
    .withTags('nft', 'access-control', 'gated')
    .requireNFTGated(
      options.nftContract,
      options.standard ?? 'erc721',
      options.tokenId,
    );

  // Add rate limit if specified
  if (options.rateLimit) {
    builder.limitPerAddress(
      options.rateLimit.maxExecutions,
      options.rateLimit.windowSeconds,
    );
  }

  builder.immediate();

  return builder.build();
}
