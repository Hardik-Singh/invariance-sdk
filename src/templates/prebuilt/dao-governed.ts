/**
 * DAO-governed template.
 */

import type { InvarianceTemplate } from '@invariance/common';
import { TemplateBuilder } from '../builder.js';

/**
 * Options for creating a DAO-governed template.
 */
export interface DAOGovernedOptions {
  /** Template name */
  name?: string;
  /** Governor contract address */
  governor: string;
  /** Minimum voting power to create proposal */
  proposalThreshold: bigint;
  /** Voting period in blocks */
  votingPeriod: number;
  /** Quorum in basis points (4000 = 40%) */
  quorumBps?: number;
  /** Timelock delay in seconds */
  timelockDelay?: number;
}

/**
 * Create a DAO-governed template requiring governance approval.
 *
 * @example
 * ```typescript
 * const template = createDAOGovernedTemplate({
 *   governor: governorContract,
 *   proposalThreshold: 100000n * 10n ** 18n, // 100k tokens
 *   votingPeriod: 50400, // ~1 week at 12s blocks
 *   quorumBps: 4000, // 40% quorum
 *   timelockDelay: 172800, // 2 days
 * });
 * ```
 */
export function createDAOGovernedTemplate(options: DAOGovernedOptions): InvarianceTemplate {
  const builder = TemplateBuilder.create(options.name ?? 'dao-governed')
    .withDescription('Requires DAO governance approval')
    .withTags('dao', 'governance', 'multisig');

  // Add DAO approval authorization
  builder.withAuthorization({
    type: 'dao-approval',
    governorContract: options.governor,
    proposalThreshold: options.proposalThreshold,
    quorumBps: options.quorumBps ?? 4000,
    votingPeriod: options.votingPeriod,
    timelockDelay: options.timelockDelay ?? 172800,
  });

  // Use delayed execution for timelock
  if (options.timelockDelay) {
    builder.delayed(options.timelockDelay, false);
  } else {
    builder.immediate();
  }

  return builder.build();
}
