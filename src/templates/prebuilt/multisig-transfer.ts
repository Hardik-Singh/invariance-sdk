/**
 * Multi-signature transfer template.
 */

import type { InvarianceTemplate } from '@invariance/common';
import { TemplateBuilder } from '../builder.js';

/**
 * Options for creating a multi-sig transfer template.
 */
export interface MultisigTransferOptions {
  /** Template name */
  name?: string;
  /** Signer addresses */
  signers: string[];
  /** Number of signatures required */
  required: number;
  /** Maximum value per transaction */
  maxPerTx: bigint;
  /** Time delay before execution (seconds) */
  delaySeconds?: number;
  /** Time window for collecting signatures (seconds) */
  collectionWindow?: number;
}

/**
 * Create a multi-sig transfer template.
 *
 * @example
 * ```typescript
 * const template = createMultisigTransferTemplate({
 *   signers: [signer1, signer2, signer3],
 *   required: 2,
 *   maxPerTx: 10000n * 10n ** 18n,
 *   delaySeconds: 3600, // 1 hour delay
 * });
 * ```
 */
export function createMultisigTransferTemplate(options: MultisigTransferOptions): InvarianceTemplate {
  const builder = TemplateBuilder.create(options.name ?? 'multisig-transfer')
    .withDescription(`Multi-sig transfer requiring ${options.required} of ${options.signers.length} signatures`)
    .withTags('transfer', 'multisig', 'security')
    .requireMultiSig(options.signers, options.required, options.collectionWindow);

  // Add value limit
  builder.withRateLimit({
    type: 'value-limit',
    token: '0x0000000000000000000000000000000000000000',
    maxValue: options.maxPerTx * 100n, // Daily limit = 100x per tx
    windowSeconds: 86400,
    scope: 'global',
    maxPerTx: options.maxPerTx,
  });

  // Add delay if specified
  if (options.delaySeconds && options.delaySeconds > 0) {
    builder.delayed(options.delaySeconds, true);
  } else {
    builder.immediate();
  }

  return builder.build();
}
