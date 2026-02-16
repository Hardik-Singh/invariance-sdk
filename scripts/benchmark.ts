/**
 * SDK Cost & Time Analysis Benchmark
 *
 * Measures real on-chain gas costs and latency for core SDK operations.
 * Results are printed as a table and saved as JSON.
 *
 * Usage:
 *   PRIVATE_KEY=0x... pnpm --filter sdk benchmark
 *   BENCHMARK_CHAIN=base PRIVATE_KEY=0x... pnpm --filter sdk benchmark
 *   BENCHMARK_ETH_PRICE=2500 PRIVATE_KEY=0x... pnpm --filter sdk benchmark
 */
import { createPublicClient, http, formatEther } from 'viem';
import { baseSepolia, base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { Invariance } from '../src/index.js';
import {
  BASE_MAINNET_CONTRACTS,
  type ContractAddresses,
} from '@invariance/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const pk = process.env.PRIVATE_KEY;
if (!pk) {
  console.error('Set PRIVATE_KEY env var');
  process.exit(1);
}

const chainName = (process.env.BENCHMARK_CHAIN ?? 'base-sepolia') as
  | 'base-sepolia'
  | 'base';
const ethPrice = Number(process.env.BENCHMARK_ETH_PRICE ?? '3000');
const defaultRpc =
  chainName === 'base' ? 'https://mainnet.base.org' : 'https://sepolia.base.org';
const rpcUrl = process.env.BENCHMARK_RPC_URL ?? defaultRpc;
const viemChain = chainName === 'base' ? base : baseSepolia;

// ---------------------------------------------------------------------------
// Mainnet guard
// ---------------------------------------------------------------------------

if (chainName === 'base') {
  const allZero = Object.values(BASE_MAINNET_CONTRACTS).every(
    (addr) =>
      typeof addr === 'string' &&
      addr === '0x0000000000000000000000000000000000000000',
  );
  if (allZero) {
    console.warn(
      '\n⚠  Base mainnet contracts are not deployed yet (all zero addresses).',
    );
    console.warn('   Run against base-sepolia instead.\n');
    process.exit(0);
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BenchmarkOperation {
  name: string;
  type: 'read' | 'write';
  gasUsed: number | null;
  gasPrice: string | null;
  ethCost: string | null;
  usdCost: number | null;
  durationMs: number;
  txHash: string | null;
  success: boolean;
  error?: string;
  skipped?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const account = privateKeyToAccount(pk as `0x${string}`);

const publicClient = createPublicClient({
  chain: viemChain,
  transport: http(rpcUrl),
});

const inv = new Invariance({
  chain: chainName,
  rpcUrl,
  signer: account,
});

const ops: BenchmarkOperation[] = [];

async function measureWrite<T extends { txHash: string }>(
  name: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  const start = performance.now();
  try {
    const result = await fn();
    const durationMs = Math.round(performance.now() - start);

    const receipt = await publicClient.getTransactionReceipt({
      hash: result.txHash as `0x${string}`,
    });

    const gasUsed = Number(receipt.gasUsed);
    const gasPrice = receipt.effectiveGasPrice.toString();
    const ethCostWei = receipt.gasUsed * receipt.effectiveGasPrice;
    const ethCost = formatEther(ethCostWei);
    const usdCost = parseFloat(ethCost) * ethPrice;

    ops.push({
      name,
      type: 'write',
      gasUsed,
      gasPrice,
      ethCost,
      usdCost: Math.round(usdCost * 1000) / 1000,
      durationMs,
      txHash: result.txHash,
      success: true,
    });

    return result;
  } catch (err: unknown) {
    const durationMs = Math.round(performance.now() - start);
    const message = err instanceof Error ? err.message : String(err);
    ops.push({
      name,
      type: 'write',
      gasUsed: null,
      gasPrice: null,
      ethCost: null,
      usdCost: null,
      durationMs,
      txHash: null,
      success: false,
      error: message,
    });
    return null;
  }
}

async function measureRead<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
  const start = performance.now();
  try {
    const result = await fn();
    const durationMs = Math.round(performance.now() - start);
    ops.push({
      name,
      type: 'read',
      gasUsed: null,
      gasPrice: null,
      ethCost: null,
      usdCost: null,
      durationMs,
      txHash: null,
      success: true,
    });
    return result;
  } catch (err: unknown) {
    const durationMs = Math.round(performance.now() - start);
    const message = err instanceof Error ? err.message : String(err);
    ops.push({
      name,
      type: 'read',
      gasUsed: null,
      gasPrice: null,
      ethCost: null,
      usdCost: null,
      durationMs,
      txHash: null,
      success: false,
      error: message,
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\nBenchmark: ${chainName} (${viemChain.id})`);
  console.log(`Signer:    ${account.address}`);
  console.log(`RPC:       ${rpcUrl}`);
  console.log(`ETH Price: $${ethPrice}\n`);

  await inv.ensureWalletInit();

  const label = `bench-${Date.now()}`;

  // 1. Register Identity
  const identity = await measureWrite('Register Identity', () =>
    inv.identity.register({
      type: 'agent',
      owner: account.address,
      label,
      capabilities: ['swap', 'transfer'],
    }),
  );

  // 2. Resolve Identity
  if (identity) {
    await measureRead('Resolve Identity', () =>
      inv.identity.resolve(account.address),
    );
  }

  // 3. Create Policy
  const policy = await measureWrite('Create Policy', () =>
    inv.policy.create({
      name: `${label}-policy`,
      actor: 'agent',
      rules: [
        { type: 'action-whitelist', config: { actions: ['swap', 'transfer'] } },
        { type: 'max-per-tx', config: { max: '1000' } },
      ],
    }),
  );

  // 4. Attach Policy
  if (policy && identity) {
    await measureWrite('Attach Policy', () =>
      inv.policy.attach(policy.policyId, identity.identityId),
    );
  }

  // 5. Evaluate Policy
  if (policy && identity) {
    await measureRead('Evaluate Policy', () =>
      inv.policy.evaluate({
        policyId: policy.policyId,
        action: 'swap',
        actor: { type: 'agent', address: account.address, identityId: identity.identityId },
        params: { from: 'USDC', to: 'ETH', amount: '10' },
      }),
    );
  }

  // 6. Log to Ledger
  if (identity) {
    await measureWrite('Log to Ledger', () =>
      inv.ledger.log({
        action: 'benchmark',
        actor: { type: 'agent', address: account.address, identityId: identity.identityId },
        category: 'custom',
        metadata: { benchmark: true, label },
        severity: 'info',
      }),
    );
  }

  // 7. Request Intent
  if (identity && policy) {
    await measureWrite('Request Intent', () =>
      inv.intent.request({
        actor: { type: 'agent', address: account.address, identityId: identity.identityId },
        action: 'swap',
        params: { from: 'USDC', to: 'ETH', amount: '10' },
        approval: 'auto',
        policyId: policy.policyId,
      }),
    );
  }

  // 8. Create Escrow (may fail without USDC balance — skip gracefully)
  if (identity) {
    const escrowResult = await measureWrite('Create Escrow', () =>
      inv.escrow.create({
        depositor: account.address,
        beneficiary: account.address,
        amount: '1000000', // 1 USDC (6 decimals)
        token: 'USDC',
      }),
    );
    if (!escrowResult) {
      const last = ops[ops.length - 1];
      last.skipped = true;
    }
  }

  // ---------------------------------------------------------------------------
  // Output
  // ---------------------------------------------------------------------------

  printTable();
  await saveJson();
}

function printTable() {
  const succeeded = ops.filter((o) => o.success).length;
  const total = ops.length;

  const totalGas = ops.reduce((s, o) => s + (o.gasUsed ?? 0), 0);
  const totalEth = ops.reduce((s, o) => s + (o.ethCost ? parseFloat(o.ethCost) : 0), 0);
  const totalUsd = ops.reduce((s, o) => s + (o.usdCost ?? 0), 0);
  const totalMs = ops.reduce((s, o) => s + o.durationMs, 0);

  const fmt = (n: number) => n.toLocaleString();
  const fmtEth = (n: number) => n.toFixed(8);

  const rows = ops.map((o) => ({
    Operation: o.name + (o.skipped ? ' (skipped)' : '') + (o.error && !o.skipped ? ' FAIL' : ''),
    Type: o.type,
    'Gas Used': o.gasUsed != null ? fmt(o.gasUsed) : 'N/A',
    'ETH Cost': o.ethCost ?? 'N/A',
    'USD Cost': o.usdCost != null ? `$${o.usdCost.toFixed(3)}` : 'N/A',
    'Time(ms)': fmt(o.durationMs),
  }));

  console.log('');
  console.table(rows);
  console.log(
    `Totals: ${fmt(totalGas)} gas | ${fmtEth(totalEth)} ETH | $${totalUsd.toFixed(2)} | ${fmt(totalMs)}ms | ${succeeded}/${total} succeeded\n`,
  );
}

async function saveJson() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const outDir = path.resolve(__dirname, '..', 'benchmarks');
  fs.mkdirSync(outDir, { recursive: true });

  const totalGas = ops.reduce((s, o) => s + (o.gasUsed ?? 0), 0);
  const totalEth = ops.reduce((s, o) => s + (o.ethCost ? parseFloat(o.ethCost) : 0), 0);
  const totalUsd = ops.reduce((s, o) => s + (o.usdCost ?? 0), 0);
  const totalMs = ops.reduce((s, o) => s + o.durationMs, 0);

  const result = {
    chain: chainName,
    chainId: viemChain.id,
    timestamp: new Date().toISOString(),
    ethPrice,
    operations: ops,
    totals: {
      gasUsed: totalGas,
      ethCost: totalEth.toFixed(8),
      usdCost: Math.round(totalUsd * 100) / 100,
      durationMs: totalMs,
    },
  };

  const filename = `results-${chainName}-${Date.now()}.json`;
  const filepath = path.join(outDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(result, null, 2) + '\n');
  console.log(`Results saved to sdk/benchmarks/${filename}`);
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
