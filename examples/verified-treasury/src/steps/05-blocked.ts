/**
 * Step 5: Trigger a Policy Violation (Action Not Allowed)
 *
 * Attempts a "withdraw" action which is NOT in the action-whitelist
 * (only "swap" and "rebalance" are permitted). The SDK should throw
 * an InvarianceError with code ACTION_NOT_ALLOWED or POLICY_VIOLATION.
 *
 * This proves the policy enforcement is working: the agent cannot
 * perform actions outside its defined boundaries.
 */

import type { Invariance, Identity, ActorReference } from '@invariance/sdk';
import { InvarianceError, ErrorCode } from '@invariance/sdk';
import { log } from '../utils/logger.js';

export async function attemptBlockedAction(
  inv: Invariance,
  identity: Identity,
): Promise<void> {
  log.step(5, 'Trigger Policy Violation (Blocked Action)');

  const actor: ActorReference = {
    type: 'agent',
    address: identity.address,
    identityId: identity.identityId,
  };

  log.info('Attempting "withdraw" action (not in whitelist)...');
  log.warn('Expected: this should be blocked by the action-whitelist rule');

  try {
    await inv.intent.request({
      actor,
      action: 'withdraw',
      params: { to: '0xSomeExternalWallet', amount: '500' },
      amount: '500',
      approval: 'auto',
    });

    // If we get here, something is wrong
    log.error('Intent should have been rejected but was not!');
  } catch (err: unknown) {
    if (err instanceof InvarianceError) {
      const isExpectedCode =
        err.code === ErrorCode.ACTION_NOT_ALLOWED ||
        err.code === ErrorCode.POLICY_VIOLATION;

      if (isExpectedCode) {
        log.success('Action correctly blocked by policy');
        log.data('Error code', err.code);
        log.data('Message', err.message);
        if (err.explorerUrl) {
          log.data('Explorer', err.explorerUrl);
        }
      } else {
        log.warn(`Unexpected error code: ${err.code}`);
        log.data('Message', err.message);
      }
    } else {
      // Re-throw unexpected errors
      throw err;
    }
  }
}
