/**
 * Verified Agent Treasury -- CLI Walkthrough
 *
 * Demonstrates the core Invariance SDK flow:
 *   1. Initialize SDK with a wallet
 *   2. Register a trading agent identity
 *   3. Create and attach a spending policy (cap + whitelist + time window)
 *   4. Execute a verified trade (dry-run then submit)
 *   5. Trigger a blocked action (not in whitelist)
 *   6. Trigger a budget violation (exceeds daily cap)
 *   7. Query the immutable audit trail
 *   8. Verify a previous transaction
 *
 * Run: pnpm start
 */

import { log } from './utils/logger.js';
import { initSDK } from './steps/01-init.js';
import { registerAgent } from './steps/02-register.js';
import { createPolicy } from './steps/03-policy.js';
import { executeTrade } from './steps/04-execute.js';
import { attemptBlockedAction } from './steps/05-blocked.js';
import { attemptOverLimit } from './steps/06-over-limit.js';
import { queryAuditTrail } from './steps/07-audit.js';
import { verifyTransaction } from './steps/08-verify.js';

async function main(): Promise<void> {
  log.banner();
  log.divider();

  // ---- Step 1: Initialize ----
  const { inv, account } = await initSDK();
  log.divider();

  // ---- Step 2: Register Agent ----
  const identity = await registerAgent(inv, account.address);
  log.divider();

  // ---- Step 3: Create Policy ----
  const _policy = await createPolicy(inv, identity);
  log.divider();

  // ---- Step 4: Execute Verified Trade ----
  const intentResult = await executeTrade(inv, identity);
  log.divider();

  // ---- Step 5: Blocked Action ----
  await attemptBlockedAction(inv, identity);
  log.divider();

  // ---- Step 6: Over-Limit ----
  await attemptOverLimit(inv, identity);
  log.divider();

  // ---- Step 7: Audit Trail ----
  await queryAuditTrail(inv, identity);
  log.divider();

  // ---- Step 8: Verify ----
  await verifyTransaction(inv, intentResult);
  log.divider();

  // ---- Done ----
  log.success('Walkthrough complete!');
  log.info('The trading agent operated within its policy boundaries.');
  log.info('Every action was logged, verified, and publicly auditable.');
  log.info('');
}

main().catch((err: unknown) => {
  log.error('Fatal error:');
  if (err instanceof Error) {
    log.error(err.message);
    if (err.stack) {
      console.error(err.stack);
    }
  } else {
    console.error(err);
  }
  process.exit(1);
});
