/**
 * Step 4: Execute a Verified Trade
 *
 * Demonstrates the two-phase intent flow:
 *   1. Dry-run with `inv.intent.prepare()` to preview policy checks
 *   2. Execute with `inv.intent.request()` to submit the verified intent
 *
 * The result includes a cryptographic proof bundle, transaction hash,
 * and a public explorer URL anyone can use to verify the action.
 */

import type { Invariance, Identity, IntentResult, ActorReference } from '@invariance/sdk';
import { log } from '../utils/logger.js';

export async function executeTrade(
  inv: Invariance,
  identity: Identity,
): Promise<IntentResult> {
  log.step(4, 'Execute Verified Trade');

  const actor: ActorReference = {
    type: 'agent',
    address: identity.address,
    identityId: identity.identityId,
  };

  // --- Part 1: Dry-run ---
  log.info('Running dry-run to preview policy evaluation...');

  const prepared = await inv.intent.prepare({
    actor,
    action: 'swap',
    params: { from: 'USDC', to: 'ETH', amount: '100' },
    approval: 'auto',
  });

  log.data('Would succeed', String(prepared.wouldSucceed));
  log.info('Policy checks:');
  for (const check of prepared.policyChecks) {
    const icon = check.passed ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
    log.info(`  ${icon}  ${check.rule}: ${check.detail}`);
  }
  if (prepared.warnings.length > 0) {
    for (const w of prepared.warnings) {
      log.warn(w);
    }
  }
  log.data('Estimated gas (USDC)', prepared.estimatedGas.usdcCost);

  // --- Part 2: Execute ---
  log.divider();
  log.info('Submitting verified intent: swap 100 USDC -> ETH...');

  const result = await inv.intent.request({
    actor,
    action: 'swap',
    params: { from: 'USDC', to: 'ETH', amount: '100' },
    amount: '100',
    approval: 'auto',
  });

  log.success('Intent executed and verified');
  log.data('Intent ID', result.intentId);
  log.data('Status', result.status);
  log.data('Action', result.action);
  log.data('Tx hash', result.txHash);
  log.data('Block', String(result.blockNumber));
  log.data('Explorer', result.explorerUrl);

  log.info('Proof bundle:');
  log.data('  Proof hash', result.proof.proofHash);
  log.data('  Verifiable', String(result.proof.verifiable));
  log.data('  Actor sig', result.proof.signatures.actor);
  if (result.proof.signatures.platform) {
    log.data('  Platform sig', result.proof.signatures.platform);
  }

  return result;
}
