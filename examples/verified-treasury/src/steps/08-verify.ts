/**
 * Step 8: Verify a Transaction
 *
 * Uses the verify module to cryptographically verify that a previous
 * intent was executed correctly. The verification result includes the
 * full proof bundle, policy compliance status, and a public explorer URL.
 *
 * This is the core Invariance value proposition: anyone can independently
 * verify what an agent did, when, and whether it followed its rules.
 */

import type { Invariance, IntentResult } from '@invariance/sdk';
import { log } from '../utils/logger.js';

export async function verifyTransaction(
  inv: Invariance,
  intentResult: IntentResult,
): Promise<void> {
  log.step(8, 'Verify Transaction');

  log.info(`Verifying tx ${intentResult.txHash}...`);

  const verification = await inv.verify(intentResult.txHash);

  log.success(`Verification ${verification.verified ? 'passed' : 'FAILED'}`);
  log.data('Verified', String(verification.verified));
  log.data('Action', verification.action);
  log.data('Actor', verification.actor.address);
  log.data('Tx hash', verification.txHash);
  log.data('Block', String(verification.blockNumber));
  log.data('Timestamp', new Date(verification.timestamp * 1000).toISOString());

  log.info('Proof:');
  log.data('  Proof hash', verification.proof.proofHash);
  log.data('  Actor sig', verification.proof.signatures.actor);
  log.data('  Verifiable', String(verification.proof.verifiable));

  if (verification.policyCompliance) {
    log.info('Policy compliance:');
    log.data('  Policy ID', verification.policyCompliance.policyId);
    log.data('  All rules passed', String(verification.policyCompliance.allRulesPassed));
  }

  log.divider();
  log.data('Explorer URL', verification.explorerUrl);

  // Also show the direct verify URL
  const verifyUrl = inv.verify.url(intentResult.intentId);
  log.data('Verify URL', verifyUrl);
  log.info('Anyone can visit this URL to independently verify the action.');
}
