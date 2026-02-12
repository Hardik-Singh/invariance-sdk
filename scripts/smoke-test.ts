/**
 * Smoke test: validates full SDK <-> Base Sepolia contract integration.
 *
 * Usage:
 *   PRIVATE_KEY=0x... npx tsx sdk/scripts/smoke-test.ts
 */
import { privateKeyToAccount } from 'viem/accounts';
import { Invariance } from '../src/index.js';

const EXPLORER = 'https://sepolia.basescan.org/tx';

async function main() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) {
    console.error('Set PRIVATE_KEY env var');
    process.exit(1);
  }

  const account = privateKeyToAccount(pk as `0x${string}`);
  console.log(`Deployer: ${account.address}\n`);

  const inv = new Invariance({
    chain: 'base-sepolia',
    rpcUrl: 'https://sepolia.base.org',
    signer: account,
  });

  await inv.ensureWalletInit();
  console.log('SDK initialized\n');

  // 1. Register identity
  console.log('[1/4] Registering identity...');
  const identity = await inv.identity.register({
    type: 'agent',
    owner: account.address,
    label: 'SmokeTestBot',
    capabilities: ['swap', 'transfer'],
  });
  console.log(`  identityId: ${identity.identityId}`);
  console.log(`  tx: ${EXPLORER}/${identity.txHash}\n`);

  // 2. Create policy & attach
  console.log('[2/4] Creating policy...');
  const policy = await inv.policy.create({
    name: 'smoke-test-policy',
    actor: 'agent',
    rules: [
      { type: 'action-whitelist', config: { actions: ['swap', 'transfer'] } },
      { type: 'max-per-tx', config: { max: '1000' } },
    ],
  });
  console.log(`  policyId: ${policy.policyId}`);
  console.log(`  tx: ${EXPLORER}/${policy.txHash}\n`);

  console.log('  Attaching policy to identity...');
  const attachTx = await inv.policy.attach(policy.policyId, identity.identityId);
  console.log(`  tx: ${EXPLORER}/${attachTx.txHash}\n`);

  // 3. Log event to ledger
  console.log('[3/4] Logging event to ledger...');
  const entry = await inv.ledger.log({
    action: 'smoke-test',
    actor: { type: 'agent', address: account.address, identityId: identity.identityId },
    category: 'custom',
    metadata: { test: true, timestamp: Date.now() },
    severity: 'info',
  });
  console.log(`  entryId: ${entry.entryId}`);
  console.log(`  tx: ${EXPLORER}/${entry.txHash}\n`);

  // 4. Submit intent
  console.log('[4/4] Submitting intent...');
  const result = await inv.intent.request({
    actor: { type: 'agent', address: account.address, identityId: identity.identityId },
    action: 'swap',
    params: { from: 'USDC', to: 'ETH', amount: '10' },
    approval: 'auto',
    policyId: policy.policyId,
  });
  console.log(`  intentId: ${result.intentId}`);
  console.log(`  status: ${result.status}`);
  console.log(`  tx: ${EXPLORER}/${result.txHash}\n`);

  // Summary
  console.log('='.repeat(50));
  console.log('SMOKE TEST PASSED');
  console.log('='.repeat(50));
  console.log(`Identity:  ${identity.txHash}`);
  console.log(`Policy:    ${policy.txHash}`);
  console.log(`Ledger:    ${entry.txHash}`);
  console.log(`Intent:    ${result.txHash}`);
}

main().catch((err) => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
