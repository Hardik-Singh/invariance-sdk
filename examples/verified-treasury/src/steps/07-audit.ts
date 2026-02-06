/**
 * Step 7: Query the Immutable Audit Trail
 *
 * Every action -- successful or rejected -- is recorded on the ledger.
 * Here we:
 *   1. Log a custom audit event (e.g. strategy update)
 *   2. Query the full trail for this agent
 *
 * The ledger is immutable and cryptographically signed. Anyone with
 * the explorer URL can independently verify the history.
 */

import type { Invariance, Identity, ActorReference, LedgerEntry } from '@invariance/sdk';
import { log } from '../utils/logger.js';

export async function queryAuditTrail(
  inv: Invariance,
  identity: Identity,
): Promise<LedgerEntry[]> {
  log.step(7, 'Query Audit Trail');

  const actor: ActorReference = {
    type: 'agent',
    address: identity.address,
    identityId: identity.identityId,
  };

  // --- Part 1: Log a custom event ---
  log.info('Logging custom audit event (strategy update)...');

  const entry = await inv.ledger.log({
    action: 'strategy-update',
    actor,
    category: 'custom',
    metadata: {
      strategy: 'momentum-v2',
      pairs: ['USDC/ETH', 'USDC/WBTC'],
      maxSlippage: '0.5%',
      updatedBy: identity.owner,
    },
  });

  log.success('Custom event logged on-chain');
  log.data('Entry ID', entry.entryId);
  log.data('Tx hash', entry.txHash);

  // --- Part 2: Query the full trail ---
  log.divider();
  log.info('Querying full audit trail...');

  const entries = await inv.ledger.query({
    actor: identity.address,
    limit: 20,
    order: 'desc',
  });

  log.success(`Found ${entries.length} ledger entries`);
  log.info('');

  // Display as a formatted table
  const header = `${'#'.padEnd(4)} ${'Action'.padEnd(20)} ${'Category'.padEnd(12)} ${'Block'.padEnd(10)} ${'Tx Hash'.padEnd(18)}`;
  log.info(header);
  log.info('-'.repeat(header.length));

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const num = String(i + 1).padEnd(4);
    const action = e.action.padEnd(20);
    const category = e.category.padEnd(12);
    const block = String(e.blockNumber).padEnd(10);
    const tx = e.txHash.slice(0, 16) + '...';
    log.info(`${num}${action}${category}${block}${tx}`);
  }

  return entries;
}
