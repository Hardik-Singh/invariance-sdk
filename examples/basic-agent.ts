/**
 * Basic example of using Invariance SDK with an AI agent.
 *
 * This example shows how to:
 * 1. Initialize the Invariance client
 * 2. Configure permission templates
 * 3. Wrap agent actions with verification
 */

import {
  Invariance,
  SpendingCap,
  TimeWindow,
  ActionWhitelist,
  LocalWallet,
  PermissionDeniedError,
} from '@invariance/sdk';

async function main() {
  // Initialize wallet (use PrivyWallet in production)
  const wallet = new LocalWallet({
    privateKey: process.env['TEST_PRIVATE_KEY'] ?? '',
    rpcUrl: 'https://sepolia.base.org',
  });

  // Initialize Invariance client
  const inv = new Invariance({
    chainId: 84532, // Base Sepolia testnet
    rpcUrl: 'https://sepolia.base.org',
    wallet,
  });

  // Configure permission templates
  const spendingCap = new SpendingCap({
    maxPerTx: 100000000000000000n, // 0.1 ETH per tx
    maxPerDay: 500000000000000000n, // 0.5 ETH per day
  });

  const timeWindow = new TimeWindow({
    startHour: 0,
    endHour: 24, // 24/7 for testing
    allowedDays: [0, 1, 2, 3, 4, 5, 6], // All days
  });

  const whitelist = new ActionWhitelist({
    allowedActions: [
      'transfer',
      'read:*',
      'query:*',
    ],
  });

  // Register pre-execution hooks
  inv.beforeExecution(async (action) => {
    console.log(`[Invariance] Verifying action: ${action.type}`);

    // Check spending cap
    const capResult = spendingCap.check(action);
    if (!capResult.allowed) {
      throw new PermissionDeniedError(
        capResult.reason ?? 'Spending cap exceeded',
        action.type,
        spendingCap.toPermission(),
      );
    }

    // Check time window
    const timeResult = timeWindow.check(action);
    if (!timeResult.allowed) {
      throw new PermissionDeniedError(
        timeResult.reason ?? 'Outside allowed time window',
        action.type,
        timeWindow.toPermission(),
      );
    }

    // Check whitelist
    const whitelistResult = whitelist.check(action);
    if (!whitelistResult.allowed) {
      throw new PermissionDeniedError(
        whitelistResult.reason ?? 'Action not whitelisted',
        action.type,
        whitelist.toPermission(),
      );
    }

    console.log(`[Invariance] Action verified: ${action.type}`);
  });

  // Example: Simulated agent actions
  console.log('\n--- Testing Agent Actions ---\n');

  // Test 1: Allowed action
  try {
    console.log('Test 1: Execute allowed read action');
    const result = await inv.execute({
      type: 'read:balance',
      params: { address: '0x1234...' },
    });
    console.log('Result:', result);
  } catch (error) {
    console.log('Error:', error instanceof Error ? error.message : error);
  }

  // Test 2: Transfer within limits
  try {
    console.log('\nTest 2: Execute transfer within spending cap');
    const result = await inv.execute({
      type: 'transfer',
      params: {
        to: '0x1234...',
        amount: '50000000000000000', // 0.05 ETH
      },
    });
    console.log('Result:', result);
  } catch (error) {
    console.log('Error:', error instanceof Error ? error.message : error);
  }

  // Test 3: Blocked action (not in whitelist)
  try {
    console.log('\nTest 3: Execute blocked action (not whitelisted)');
    const result = await inv.execute({
      type: 'admin:delete',
      params: { targetId: '123' },
    });
    console.log('Result:', result);
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      console.log('Permission denied:', error.message);
      console.log('Blocked by:', error.permission?.type);
    }
  }
}

main().catch(console.error);
