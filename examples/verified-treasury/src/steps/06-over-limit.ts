/**
 * Step 6: Trigger a Policy Violation (Budget Exceeded)
 *
 * Attempts a $5000 swap which exceeds the $1000/day spending cap.
 * The SDK should throw an InvarianceError with code BUDGET_EXCEEDED
 * or POLICY_VIOLATION.
 *
 * This demonstrates that spending limits are enforced on-chain --
 * no matter what the agent tries, it cannot exceed its budget.
 */

import type { Invariance, Identity, ActorReference } from '@invariance/sdk';
import { InvarianceError, ErrorCode } from '@invariance/sdk';
import { log } from '../utils/logger.js';

export async function attemptOverLimit(
  inv: Invariance,
  identity: Identity,
): Promise<void> {
  log.step(6, 'Trigger Policy Violation (Over Budget)');

  const actor: ActorReference = {
    type: 'agent',
    address: identity.address,
    identityId: identity.identityId,
  };

  log.info('Attempting $5,000 swap (exceeds $1,000/day cap)...');
  log.warn('Expected: this should be blocked by the max-spend rule');

  try {
    await inv.intent.request({
      actor,
      action: 'swap',
      params: { from: 'USDC', to: 'ETH', amount: '5000' },
      amount: '5000',
      approval: 'auto',
    });

    log.error('Intent should have been rejected but was not!');
  } catch (err: unknown) {
    if (err instanceof InvarianceError) {
      const isExpectedCode =
        err.code === ErrorCode.BUDGET_EXCEEDED ||
        err.code === ErrorCode.POLICY_VIOLATION;

      if (isExpectedCode) {
        log.success('Spending correctly blocked by budget cap');
        log.data('Error code', err.code);
        log.data('Message', err.message);
        log.data('Attempted', '$5,000 USDC');
        log.data('Daily limit', '$1,000 USDC');
        if (err.explorerUrl) {
          log.data('Explorer', err.explorerUrl);
        }
      } else {
        log.warn(`Unexpected error code: ${err.code}`);
        log.data('Message', err.message);
      }
    } else {
      throw err;
    }
  }
}
