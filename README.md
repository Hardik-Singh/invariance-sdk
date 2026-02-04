# @invariance/sdk

TypeScript SDK for Invariance Protocol - secure execution layer for autonomous agents.

## Installation

```bash
pnpm add @invariance/sdk
```

## Quick Start

```typescript
import { Invariance, SpendingCap, TimeWindow, ActionWhitelist } from '@invariance/sdk';

// Initialize the client
const inv = new Invariance({
  chainId: 8453, // Base mainnet
  rpcUrl: process.env.RPC_URL,
});

// Configure permissions
const spendingCap = new SpendingCap({
  maxPerTx: 1000000000000000000n, // 1 ETH per tx
  maxPerDay: 5000000000000000000n, // 5 ETH per day
});

const timeWindow = new TimeWindow({
  startHour: 9,
  endHour: 17,
  allowedDays: [1, 2, 3, 4, 5], // Mon-Fri
});

const whitelist = new ActionWhitelist({
  allowedActions: ['transfer', 'read:*'],
});

// Execute an action
const result = await inv.execute({
  type: 'transfer',
  params: {
    to: '0x...',
    amount: '1000000000000000000', // 1 ETH
  },
});
```

## Features

### Permission Templates

#### SpendingCap
Limits ETH/token spending per transaction and per day.

```typescript
const cap = new SpendingCap({
  maxPerTx: 1000000000000000000n, // 1 ETH
  maxPerDay: 5000000000000000000n, // 5 ETH
  token: '0x...', // Optional: token address (default: native ETH)
});
```

#### TimeWindow
Restricts action execution to specific hours and days.

```typescript
const window = new TimeWindow({
  startHour: 9,  // 9 AM UTC
  endHour: 17,   // 5 PM UTC
  allowedDays: [1, 2, 3, 4, 5], // Mon-Fri
});
```

#### ActionWhitelist
Only allows specific action types.

```typescript
const whitelist = new ActionWhitelist({
  allowedActions: [
    'transfer',      // Exact match
    'read:*',        // Wildcard: matches read:balance, read:history, etc.
  ],
});
```

#### Voting
Requires consensus before action execution (multi-sig, DAO, or threshold voting).

```typescript
import { Voting } from '@invariance/sdk';

const voting = new Voting({
  config: {
    mode: 'multi-sig',
    requiredSignatures: 2,
    totalSigners: 3,
    signers: ['0x...', '0x...', '0x...'],
    expirationPeriod: 86400,
  },
  requiredForActions: ['transfer', 'withdraw'],
});

// Register vote collection callback
voting.onVoteRequest(async (proposal) => {
  return await collectVotes(proposal);
});

// Use async check for voting flow
const result = await voting.checkAsync(action);
```

#### HumanApproval
Requires human-in-the-loop confirmation based on triggers.

```typescript
import { HumanApproval } from '@invariance/sdk';

const approval = new HumanApproval({
  triggers: [
    { type: 'amount-threshold', threshold: 1000000000000000000n }, // > 1 ETH
    { type: 'action-type', patterns: ['admin:*'] },
  ],
  timeoutSeconds: 300,
});

// Register approval callback
approval.onApprovalRequest(async (request) => {
  return await showApprovalDialog(request);
});

// Use async check for approval flow
const result = await approval.checkAsync(action);
```

### Wallet Adapters

#### Privy (Production)
```typescript
import { PrivyWallet } from '@invariance/sdk';

const wallet = new PrivyWallet({
  appId: process.env.PRIVY_APP_ID,
  apiSecret: process.env.PRIVY_API_SECRET,
});

const inv = new Invariance({
  chainId: 8453,
  rpcUrl: process.env.RPC_URL,
  wallet,
});
```

#### Local (Testing)
```typescript
import { LocalWallet } from '@invariance/sdk';

const wallet = new LocalWallet({
  privateKey: process.env.TEST_PRIVATE_KEY,
  rpcUrl: 'https://sepolia.base.org',
});

const inv = new Invariance({
  chainId: 84532, // Base Sepolia
  rpcUrl: 'https://sepolia.base.org',
  wallet,
});
```

### Error Handling

```typescript
import { PermissionDeniedError, StateFailedError } from '@invariance/sdk';

try {
  await inv.execute(action);
} catch (error) {
  if (error instanceof PermissionDeniedError) {
    console.log('Action not allowed:', error.actionType);
    console.log('Denied by:', error.permission?.type);
  } else if (error instanceof StateFailedError) {
    console.log('State condition failed:', error.condition);
  }
}
```

## API Reference

### Invariance

Main client class.

```typescript
new Invariance(config: InvarianceConfig)
```

**Config:**
- `chainId: number` - Target chain ID (8453 for Base, 84532 for Base Sepolia)
- `rpcUrl: string` - RPC URL for blockchain communication
- `wallet?: WalletAdapter` - Wallet adapter for signing
- `permissions?: PermissionConfig` - Permission configuration

**Methods:**
- `execute(input: ActionInput): Promise<ActionResult>` - Execute an action
- `checkPermission(input: ActionInput): boolean` - Check if action is permitted
- `beforeExecution(callback): void` - Register pre-execution hook
- `getChainConfig()` - Get current chain configuration
- `getContractAddresses()` - Get contract addresses

### Types

See [@invariance/common](../packages/common/README.md) for shared types.

## License

MIT
