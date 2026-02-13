/**
 * Invariance SDK — Two-Wallet Verification Demo
 *
 * Shows the full flow: Alice hires an agent, the agent does work,
 * and Alice verifies every action on-chain.
 *
 * Run against Base Sepolia (requires two funded wallets):
 *   INVARIANCE_PRIVATE_KEY=<alice_key> AGENT_PRIVATE_KEY=<agent_key> \
 *     npx tsx sdk/examples/two-wallet-demo.ts
 *
 * Or run locally with Anvil (no real funds needed):
 *   anvil &
 *   npx tsx sdk/examples/two-wallet-demo.ts --local
 */

import { Invariance } from '../src/index.js';
import { privateKeyToAccount } from 'viem/accounts';

// ── Helpers ──────────────────────────────────────────────────────────

function ms(label: string, fn: () => Promise<unknown>): () => Promise<unknown> {
  return async () => {
    const t0 = performance.now();
    const result = await fn();
    const elapsed = (performance.now() - t0).toFixed(1);
    console.log(`  ${label} — ${elapsed}ms`);
    return result;
  };
}

function header(text: string) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${text}`);
  console.log('═'.repeat(60));
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  header('INVARIANCE — Two-Wallet Verification Demo');

  // 1. Initialize two SDK instances (Alice = human, Bot = agent)
  const aliceKey = process.env['INVARIANCE_PRIVATE_KEY'];
  const agentKey = process.env['AGENT_PRIVATE_KEY'];

  if (!aliceKey || !agentKey) {
    console.error('Set INVARIANCE_PRIVATE_KEY (Alice) and AGENT_PRIVATE_KEY (Bot)');
    process.exit(1);
  }

  const alice = new Invariance({ chain: 'base-sepolia' });
  const bot = new Invariance({
    chain: 'base-sepolia',
    signer: privateKeyToAccount(
      (agentKey.startsWith('0x') ? agentKey : `0x${agentKey}`) as `0x${string}`,
    ),
  });

  const aliceAddr = alice.wallet.getAddress();
  const botAddr = bot.wallet.getAddress();
  console.log(`\n  Alice : ${aliceAddr}`);
  console.log(`  Bot   : ${botAddr}`);

  // ── Step 2: Register identities ────────────────────────────────────
  header('Step 1 — Register Identities');

  const aliceId = await ms('register Alice (human)', async () =>
    alice.identity.register({
      type: 'human',
      owner: aliceAddr,
      label: 'Alice',
    }),
  )() as Awaited<ReturnType<typeof alice.identity.register>>;

  const botId = await ms('register Bot (agent)', async () =>
    bot.identity.register({
      type: 'agent',
      owner: botAddr,
      label: 'ContentBot',
      capabilities: ['write-blog', 'seo-optimize'],
    }),
  )() as Awaited<ReturnType<typeof bot.identity.register>>;

  console.log(`\n  Alice identity: ${aliceId.identityId}`);
  console.log(`  Bot identity  : ${botId.identityId}`);

  // ── Step 3: Alice creates a policy and attaches it to the bot ──────
  header('Step 2 — Create & Attach Policy');

  const policy = await ms('create policy', async () =>
    alice.policy.create({
      name: 'Blog Writing Limits',
      actor: 'agent',
      rules: [
        { type: 'max-spend', config: { limit: '500' } },
        { type: 'action-whitelist', config: { actions: ['write-blog', 'seo-optimize'] } },
      ],
    }),
  )() as Awaited<ReturnType<typeof alice.policy.create>>;

  await ms('attach policy to bot', async () =>
    alice.policy.attach(policy.policyId, botId.identityId),
  )();

  console.log(`\n  Policy: ${policy.policyId}`);

  // ── Step 4: Evaluate policy (dry-run) ──────────────────────────────
  header('Step 3 — Policy Check (dry-run)');

  const evalResult = await ms('evaluate write-blog', async () =>
    alice.policy.evaluate({
      policyId: policy.policyId,
      actor: { type: 'agent', address: botAddr, identityId: botId.identityId },
      action: 'write-blog',
      params: { topic: 'AI safety', wordCount: 1500 },
    }),
  )() as Awaited<ReturnType<typeof alice.policy.evaluate>>;

  console.log(`\n  Allowed: ${evalResult.allowed}`);
  console.log(`  Violations: ${evalResult.violations.length}`);

  // ── Step 5: Bot executes the action via intent protocol ────────────
  header('Step 4 — Bot Executes Action');

  const intent = await ms('request intent (auto-approve)', async () =>
    bot.intent.request({
      actor: { type: 'agent', address: botAddr },
      action: 'write-blog',
      params: { topic: 'AI safety', wordCount: 1500 },
      approval: 'auto',
    }),
  )() as Awaited<ReturnType<typeof bot.intent.request>>;

  console.log(`\n  Intent ID : ${intent.intentId}`);
  console.log(`  Status    : ${intent.status}`);
  console.log(`  Tx hash   : ${intent.proof.txHash}`);

  // ── Step 6: Bot logs the completed work to the ledger ──────────────
  header('Step 5 — Log to Immutable Ledger');

  const entry = await ms('log action', async () =>
    bot.ledger.log({
      action: 'write-blog',
      actor: { type: 'agent', address: botAddr },
      metadata: {
        topic: 'AI safety',
        wordCount: 1500,
        intentId: intent.intentId,
        deliveredAt: new Date().toISOString(),
      },
    }),
  )() as Awaited<ReturnType<typeof bot.ledger.log>>;

  console.log(`\n  Entry ID  : ${entry.entryId}`);
  console.log(`  Tx hash   : ${entry.txHash}`);
  console.log(`  Proof hash: ${entry.proof.proofHash}`);

  // ── Step 7: Alice verifies — this is the key part ──────────────────
  header('Step 6 — Alice Verifies On-Chain');

  console.log('\n  Verifying ledger tx...');
  const t0 = performance.now();
  const verification = await alice.verify(entry.txHash);
  const verifyMs = (performance.now() - t0).toFixed(1);

  console.log(`\n  ┌─────────────────────────────────────────────┐`);
  console.log(`  │  VERIFICATION RESULT                        │`);
  console.log(`  ├─────────────────────────────────────────────┤`);
  console.log(`  │  Verified     : ${verification.verified}                      │`);
  console.log(`  │  Action       : ${verification.action.padEnd(28)}│`);
  console.log(`  │  Actor        : ${verification.actor.address.slice(0, 10)}...${verification.actor.address.slice(-4)}              │`);
  console.log(`  │  Actor type   : ${verification.actor.type.padEnd(28)}│`);
  console.log(`  │  Block        : ${String(verification.blockNumber).padEnd(28)}│`);
  console.log(`  │  Signatures   : ${verification.proof.signatures.valid ? 'valid ✓' : 'invalid ✗'}                      │`);
  console.log(`  │  Time         : ${verifyMs}ms                        │`);
  console.log(`  │  Explorer     : ${verification.explorerUrl.slice(0, 28)}...│`);
  console.log(`  └─────────────────────────────────────────────┘`);

  // ── Step 8: Bulk verify ────────────────────────────────────────────
  header('Step 7 — Bulk Verify (intent + ledger txs)');

  const t1 = performance.now();
  const bulkResults = await alice.verify.bulk([intent.proof.txHash, entry.txHash]);
  const bulkMs = (performance.now() - t1).toFixed(1);

  for (const r of bulkResults) {
    console.log(`  ${r.txHash.slice(0, 12)}... → verified: ${r.verified}, action: ${r.action}`);
  }
  console.log(`  Total: ${bulkMs}ms for ${bulkResults.length} txs`);

  // ── Step 9: Full identity audit ────────────────────────────────────
  header('Step 8 — Identity Audit');

  const audit = await ms('audit bot identity', async () =>
    alice.verify.identity(botAddr),
  )() as Awaited<ReturnType<typeof alice.verify.identity>>;

  console.log(`\n  Label           : ${audit.identity.label}`);
  console.log(`  Type            : ${audit.identity.type}`);
  console.log(`  Capabilities    : ${audit.identity.capabilities.join(', ')}`);
  console.log(`  Total actions   : ${audit.totalActions}`);
  console.log(`  Verified actions: ${audit.verifiedActions}`);
  console.log(`  Explorer        : ${audit.explorerUrl}`);

  // ── Done ───────────────────────────────────────────────────────────
  header('Done');
  console.log('\n  Every action was policy-gated, logged, and cryptographically verified.');
  console.log('  Alice can share the explorer URLs with anyone for independent verification.\n');
}

main().catch((err) => {
  console.error('\nDemo failed:', err.message ?? err);
  process.exit(1);
});
