/**
 * Simple transfer template.
 */

import type { InvarianceTemplate } from '@invariance/common';
import { TemplateBuilder } from '../builder.js';

/**
 * Options for creating a simple transfer template.
 */
export interface SimpleTransferOptions {
  /** Template name */
  name?: string;
  /** Maximum value per transaction */
  maxPerTx: bigint;
  /** Maximum value per day */
  maxPerDay: bigint;
  /** Token address (zero address for native ETH) */
  token?: string;
  /** Allowed recipient addresses (optional whitelist) */
  allowedRecipients?: string[];
  /** Required signer address */
  signer?: string;
}

/**
 * Create a simple transfer template with basic limits.
 *
 * @example
 * ```typescript
 * const template = createSimpleTransferTemplate({
 *   maxPerTx: 1000n * 10n ** 18n,  // 1000 tokens
 *   maxPerDay: 5000n * 10n ** 18n, // 5000 tokens per day
 * });
 * ```
 */
export function createSimpleTransferTemplate(options: SimpleTransferOptions): InvarianceTemplate {
  const builder = TemplateBuilder.create(options.name ?? 'simple-transfer')
    .withDescription('Simple transfer with spending limits')
    .withTags('transfer', 'spending-cap')
    .limitValue(
      options.token ?? '0x0000000000000000000000000000000000000000',
      options.maxPerDay,
      86400, // 24 hours
      'per-address',
    )
    .immediate();

  // Add per-tx limit via value limit with maxPerTx
  if (options.maxPerTx) {
    builder.withRateLimit({
      type: 'value-limit',
      token: options.token ?? '0x0000000000000000000000000000000000000000',
      maxValue: options.maxPerDay,
      windowSeconds: 86400,
      scope: 'per-address',
      maxPerTx: options.maxPerTx,
    });
  }

  // Add signature requirement if signer specified
  if (options.signer) {
    builder.requireSignature(options.signer);
  }

  // Add recipient whitelist if specified
  if (options.allowedRecipients && options.allowedRecipients.length > 0) {
    builder.requireWhitelist(options.allowedRecipients);
  }

  return builder.build();
}
