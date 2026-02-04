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

// Configure policies
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

### Execution Policies

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

### Permission Marketplace

The SDK includes a built-in marketplace for community-created custom permissions.

#### Browsing Permissions

```typescript
import { MarketplaceClient, getContractAddresses } from '@invariance/sdk';

const marketplace = new MarketplaceClient({
  addresses: getContractAddresses(8453),
  rpcUrl: 'https://mainnet.base.org',
  wallet: myWallet, // Optional for read-only operations
});

// List verified permissions
const permissions = await marketplace.listPermissions({
  verifiedOnly: true,
  tag: 'spending',
  sortBy: 'usageCount',
});

// Get featured/popular permissions
const featured = await marketplace.getFeaturedPermissions();

// Get a specific permission
const permission = await marketplace.getPermission(permissionId);
```

#### Enabling Permissions

```typescript
// Enable a permission for your agent
await marketplace.enablePermission({
  permissionId: createCustomPermissionId(1),
  gasBudget: 100000n,
});

// Check enabled permissions
const enabled = await marketplace.getEnabledPermissions(agentAddress);

// Disable a permission
await marketplace.disablePermission(permissionId);
```

#### Deploying Custom Permissions

```typescript
import { CustomPermissionDeployer } from '@invariance/sdk';

const deployer = new CustomPermissionDeployer({
  addresses: getContractAddresses(8453),
  rpcUrl: 'https://mainnet.base.org',
  wallet: myWallet,
});

// Deploy from template
const { permissionId, contractAddress } = await deployer.deployFromTemplate(
  'max-daily-spend',
  { maxDaily: 10_000_000_000_000_000_000n }, // 10 ETH
);

// Available templates
const templates = deployer.getAvailableTemplates();
// ['max-daily-spend', 'address-whitelist', 'address-blacklist',
//  'time-restricted', 'action-type-filter', 'value-threshold',
//  'rate-limiter', 'cooldown-enforcer']

// Get template info
const info = deployer.getTemplateInfo('max-daily-spend');
```

### Template System

For advanced use cases, the SDK provides a comprehensive template system for defining complex verification rules.

```typescript
import {
  createSimpleTransferTemplate,
  createMultisigTransferTemplate,
  createTradingAgentTemplate,
  TemplateVerifier,
} from '@invariance/sdk';

// Create a simple transfer template
const template = createSimpleTransferTemplate({
  maxValue: 1000000000000000000n, // 1 ETH
  cooldown: 60, // 60 seconds between transfers
  allowedRecipients: ['0x...', '0x...'],
});

// Verify actions against templates
const verifier = new TemplateVerifier();
verifier.registerTemplate(template);

const result = await verifier.verifyAction(template.id, action, proofs);
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
import { PolicyDeniedError, StateFailedError } from '@invariance/sdk';

try {
  await inv.execute(action);
} catch (error) {
  if (error instanceof PolicyDeniedError) {
    console.log('Action not allowed:', error.actionType);
    console.log('Denied by:', error.policy?.type);
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
- `policies?: PolicyConfig` - Policy configuration

**Methods:**
- `execute(input: ActionInput): Promise<ActionResult>` - Execute an action
- `simulateExecute(input: ActionInput): Promise<SimulationResult>` - Simulate an action
- `checkPermission(input: ActionInput): boolean` - Check if action is permitted
- `beforeExecution(callback): void` - Register pre-execution hook
- `getChainConfig()` - Get current chain configuration
- `getContractAddresses()` - Get contract addresses
- `marketplace` - Access the permission marketplace client
- `deployer` - Access the custom permission deployer

### MarketplaceClient

Client for browsing and managing custom permissions.

**Methods:**
- `listPermissions(options?): Promise<CustomPermissionMetadata[]>` - List marketplace permissions
- `getPermission(id): Promise<CustomPermissionMetadata>` - Get permission by ID
- `getFeaturedPermissions(limit?): Promise<CustomPermissionMetadata[]>` - Get popular permissions
- `enablePermission(config): Promise<TransactionResult>` - Enable a permission
- `disablePermission(id): Promise<TransactionResult>` - Disable a permission
- `checkPermissions(agent, action, params): Promise<CustomPermissionCheckResult>` - Check permissions

### CustomPermissionDeployer

Deploys custom permission contracts.

**Methods:**
- `deployFromTemplate(template, config): Promise<DeployPermissionResult>` - Deploy from template
- `getAvailableTemplates(): BuiltInTemplateType[]` - List available templates
- `getTemplateInfo(template): object` - Get template configuration schema

### Types

See [@invariance/common](../packages/common/README.md) for shared types.

## Migration from v0.x

If you're upgrading from an earlier version, note these terminology changes:

| Old (v0.x) | New (v1.x) |
|------------|------------|
| `Permission` | `Policy` |
| `PermissionConfig` | `PolicyConfig` |
| `SpendingCapPermission` | `SpendingCapPolicy` |
| `PermissionDeniedError` | `PolicyDeniedError` |
| `checkPermission()` | `checkPolicy()` |
| `permissions` config field | `policies` config field |

The old names are still supported as deprecated aliases for backward compatibility.

## License

MIT
