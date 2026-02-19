# @invariance/sdk

TypeScript SDK for Invariance Protocol -- the verification layer for autonomous agents on Base L2.

## Installation

```bash
pnpm add @invariance/sdk
```

## Quick Start

### Zero-config (recommended)

Create a `.env` file (see `sdk/.env.example`):

```env
INVARIANCE_CHAIN=base-sepolia
INVARIANCE_RPC_URL=https://sepolia.base.org
INVARIANCE_PRIVATE_KEY=0x...
```

```typescript
import { Invariance } from '@invariance/sdk';

// Automatically reads from .env — no args needed
const inv = new Invariance();
```

### Explicit config

```typescript
import { Invariance } from '@invariance/sdk';

const inv = new Invariance({
  chain: 'base-sepolia',
  rpcUrl: process.env.RPC_URL,
  signer: wallet, // viem Account, WalletClient, or EIP-1193 provider
});

// Wait for wallet connection
await inv.ensureWalletInit();

// Register an on-chain identity
const agent = await inv.identity.register({
  type: 'agent',
  owner: '0xYourAddress',
  label: 'TraderBot',
  capabilities: ['swap', 'transfer'],
});

// Create and attach a policy
const policy = await inv.policy.create({
  name: 'Trading Limits',
  actor: 'agent',
  rules: [
    { type: 'max-spend', config: { limit: '100000' } },
    { type: 'action-whitelist', config: { actions: ['swap', 'transfer'] } },
  ],
});
await inv.policy.attach(policy.policyId, agent.identityId);

// Execute a verified intent
const result = await inv.intent.request({
  actor: { type: 'agent', address: agent.address },
  action: 'swap',
  params: { from: 'USDC', to: 'ETH', amount: '100' },
  approval: 'auto',
});

// Verify any transaction
const verification = await inv.verify(result.proof.txHash);
```

## Signer Types

The SDK accepts three signer types via `config.signer`:

| Type | Example |
|------|---------|
| **viem Account** | `privateKeyToAccount('0x...')` |
| **WalletClient** | `createWalletClient({ ... })` |
| **EIP-1193 Provider** | `window.ethereum`, injected wallets |

## Modules

All modules are lazily initialized and accessed as properties on the `Invariance` client.

### `inv.identity` -- IdentityManager

Register agents, humans, and devices as verified on-chain identities.

| Method | Description |
|--------|-------------|
| `register(opts)` | Register a new identity |
| `get(identityId)` | Get identity by ID |
| `resolve(address)` | Resolve address to identity |
| `update(identityId, opts)` | Update label/capabilities |
| `pause(identityId)` | Temporarily suspend |
| `resume(identityId)` | Resume from pause |
| `deactivate(identityId)` | Permanently deactivate |
| `list(filters?)` | List identities (requires indexer) |
| `attest(input)` | Add attestation to identity |
| `attestations(identityId)` | Get attestations |

### `inv.intent` -- IntentProtocol

Request-approve-execute-verify handshake for agent actions.

| Method | Description |
|--------|-------------|
| `request(opts)` | Submit an intent for execution |
| `prepare(opts)` | Dry-run with policy checks and gas estimate |
| `approve(intentId)` | Approve a pending intent |
| `reject(intentId, reason)` | Reject a pending intent |
| `status(intentId)` | Get lifecycle state from on-chain data |
| `history(filters?)` | Query intent history (requires indexer) |

### `inv.policy` -- PolicyEngine

Composable, verifiable condition sets enforced on-chain.

| Method | Description |
|--------|-------------|
| `create(opts)` | Create a policy with rules |
| `attach(policyId, identityId)` | Bind policy to identity |
| `detach(policyId, identityId)` | Unbind policy |
| `evaluate(opts)` | Check if action is allowed |
| `revoke(policyId)` | Revoke a policy |
| `status(policyId)` | Get policy status |
| `list(filters?)` | List policies |
| `compose(policyIds)` | Compose multiple policies |
| `onViolation(callback)` | Subscribe to violations |

**Rule types:** `max-spend`, `max-per-tx`, `daily-limit`, `require-balance`, `action-whitelist`, `action-blacklist`, `target-whitelist`, `target-blacklist`, `time-window`, `cooldown`, `rate-limit`, `custom`

### `inv.escrow` -- EscrowManager

USDC escrow with multi-sig and conditional release.

| Method | Description |
|--------|-------------|
| `create(opts)` | Create escrow between parties |
| `fund(escrowId)` | Fund with USDC |
| `release(escrowId)` | Release funds to beneficiary |
| `refund(escrowId)` | Refund to depositor |
| `dispute(escrowId, reason)` | Open a dispute |
| `resolve(escrowId, opts)` | Resolve a dispute |
| `approve(escrowId)` | Add multi-sig approval |
| `approvals(escrowId)` | Get approval status |
| `status(escrowId)` | Get escrow state |
| `list(filters?)` | List escrows |
| `onStateChange(callback)` | Subscribe to state changes |

### `inv.ledger` -- EventLedger

Immutable on-chain logging with dual signatures (actor + platform).

| Method | Description |
|--------|-------------|
| `log(event)` | Log a single entry |
| `batch(events)` | Log multiple entries in one tx |
| `query(filters)` | Query entries (requires indexer) |
| `stream(filters, callback)` | Real-time event stream |
| `export(filters)` | Export as JSON/CSV |

### `inv.logOffchain(...)` and `inv.queryOffchainLogs(...)`

Dead-simple off-chain logging with correlation IDs and optional dual-write.

```typescript
// 1-line off-chain audit log (defaults to mode: "audit")
const log = await inv.logOffchain('agent.swap', {
  actor: { type: 'agent', address: '0xAgent' },
  metadata: { from: 'USDC', to: 'ETH', amount: '100' },
});

console.log(log.requestId); // correlation id across systems

// Query recent logs
const recent = await inv.queryOffchainLogs({
  actor: '0xAgent',
  action: 'agent.swap',
  page: 1,
  pageSize: 20,
});
```

Session-scoped usage (no repeated actor):

```typescript
const session = inv.session({ actor: { type: 'agent', address: '0xAgent' } });

await session.logOffchain('agent.swap', {
  metadata: { pair: 'USDC/ETH' },
});

const mine = await session.myOffchainLogs({ pageSize: 50 });
```

### `inv.verify` -- Verifier

Cryptographic verification and public explorer URLs. Callable directly as `inv.verify(txHash)` and via sub-methods.

| Method | Description |
|--------|-------------|
| `inv.verify(txHash)` | Verify a transaction (direct call) |
| `inv.verify.action(opts)` | Verify by actor + action |
| `inv.verify.identity(address)` | Full identity audit |
| `inv.verify.escrow(escrowId)` | Escrow audit trail |
| `inv.verify.proof(proofHash)` | Decode and validate a proof |
| `inv.verify.bulk(txHashes)` | Batch verify transactions |
| `inv.verify.url(intentId)` | Generate public explorer URL |

### `inv.reputation` -- ReputationEngine

Auto-calculated scores and 1-5 star reviews.

| Method | Description |
|--------|-------------|
| `get(address)` | Full reputation profile |
| `review(opts)` | Submit on-chain review |
| `getReviews(address)` | Get reviews for address |
| `score(address)` | Calculate overall score |
| `compare(addresses)` | Rank multiple addresses |
| `badge(address)` | Get reputation badge |
| `history(address)` | Score history over time |

### `inv.wallet` -- WalletManager

| Method | Description |
|--------|-------------|
| `get()` | Get wallet info |
| `balance()` | Get ETH balance |
| `getAddress()` | Get connected address |
| `isConnected()` | Check connection status |

### `inv.gas` -- GasManager

| Method | Description |
|--------|-------------|
| `estimate(opts)` | Estimate gas for an action |
| `balance()` | Get ETH balance for gas |

### `inv.x402` -- X402Manager

Pay-per-action execution and agent-to-agent payments via x402.

| Method | Description |
|--------|-------------|
| `payForAction(opts)` | Execute a paid action |
| `verifyPayment(txHash)` | Verify a payment receipt |
| `history(filters?)` | Query payment history |
| `estimateCost(action)` | Estimate cost for an action |
| `configure(settings)` | Configure payment settings |

### `inv.erc8004` -- ERC8004Manager

Standalone ERC-8004 (Trustless Agents) manager for on-chain agent identity, reputation, and validation.

### `inv.erc8004Bridge` -- InvarianceBridge

Bridge between ERC-8004 and Invariance modules: link identities, bridge reputation, cross-protocol validation.

## Error Handling

```typescript
import { InvarianceError, ErrorCode } from '@invariance/sdk';

try {
  await inv.intent.request({ ... });
} catch (err) {
  if (err instanceof InvarianceError) {
    console.log(err.code);    // ErrorCode enum value
    console.log(err.message); // Human-readable description
  }
}
```

Key error codes: `IDENTITY_NOT_FOUND`, `POLICY_DENIED`, `ESCROW_NOT_FOUND`, `TX_REVERTED`, `VERIFICATION_FAILED`, `WALLET_NOT_CONNECTED`, `NETWORK_ERROR`, `NOT_IMPLEMENTED`

## Events

Subscribe to SDK events via the shared event emitter:

```typescript
inv.on('identity.registered', (data) => { ... });
inv.on('intent.requested', (data) => { ... });
inv.on('policy.created', (data) => { ... });
inv.on('policy.violation', (data) => { ... });
inv.on('escrow.created', (data) => { ... });
inv.on('ledger.logged', (data) => { ... });
inv.on('reputation.reviewed', (data) => { ... });
```

## Examples

See `examples/` for complete working applications:

| Example | Description |
|---------|-------------|
| `examples/verified-treasury/` | CLI: policy-gated spending, verified intents, audit trails |
| `examples/governance-dao/` | Web: democratic AI governance with multi-sig approval |
| `examples/agent-marketplace/` | Web: hire agents, USDC escrow, reviews, reputation |

## License

MIT
