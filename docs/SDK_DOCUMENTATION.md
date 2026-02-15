# Invariance SDK Documentation

> **Version:** 0.0.1 | **Chain:** Base L2 | **Language:** TypeScript

Invariance is a verification layer for AI agents. It provides on-chain enforcement of permission boundaries, immutable execution logs, and cryptographic provenance — without being an agent framework itself. One SDK integration makes any agent verifiable.

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Core Concepts](#core-concepts)
- [API Reference](#api-reference)
  - [Identity](#identity)
  - [Wallet](#wallet)
  - [Intent](#intent)
  - [Policy](#policy)
  - [Escrow](#escrow)
  - [Ledger](#ledger)
  - [Verify](#verify)
  - [Reputation](#reputation)
  - [Gas](#gas)
  - [X402 Payments](#x402-payments)
  - [ERC-8004](#erc-8004)
  - [ERC-8004 Bridge](#erc-8004-bridge)
  - [Marketplace](#marketplace)
  - [Webhooks](#webhooks)
- [Examples](#examples)
- [Error Handling](#error-handling)
- [Events](#events)
- [Advanced Topics](#advanced-topics)
- [Troubleshooting & FAQ](#troubleshooting--faq)

---

## Installation

```bash
pnpm add @invariance/sdk
# or
npm install @invariance/sdk
```

**Requirements:**
- Node.js >= 18
- A Base Sepolia (testnet) or Base (mainnet) wallet with ETH for gas
- Testnet faucets: [Coinbase ETH Faucet](https://www.coinbase.com/faucets/base-ethereum-goerli-faucet) (select Base Sepolia), [Circle USDC Faucet](https://faucet.circle.com/) (select Base Sepolia)

---

## Quick Start

Create a `.env` file:

```env
INVARIANCE_PRIVATE_KEY=0xYourPrivateKeyHere
INVARIANCE_RPC_URL=https://sepolia.base.org
INVARIANCE_CHAIN=base-sepolia
```

Minimal working example:

```typescript
import { Invariance } from '@invariance/sdk';

const inv = new Invariance(); // auto-reads .env

// Register an agent
const agent = await inv.identity.register({
  type: 'agent',
  owner: inv.wallet.getAddress(),
  label: 'MyBot',
  capabilities: ['swap', 'transfer'],
});

// Create a spending policy
const policy = await inv.policy.create({
  name: 'Limits',
  actor: 'agent',
  rules: [
    { type: 'max-spend', config: { limit: '1000' } },
    { type: 'action-whitelist', config: { actions: ['swap', 'transfer'] } },
  ],
});
await inv.policy.attach(policy.policyId, agent.identityId);

// Execute a verified action
const result = await inv.intent.request({
  actor: { type: 'agent', address: agent.address },
  action: 'swap',
  params: { from: 'USDC', to: 'ETH', amount: '50' },
  approval: 'auto',
});

// Verify on-chain
const verification = await inv.verify(result.txHash);
console.log('Verified:', verification.verified);
```

---

## Configuration

### Constructor

```typescript
const inv = new Invariance(config?: Partial<InvarianceConfig>);
```

### InvarianceConfig

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `chain` | `'base' \| 'base-sepolia'` | from env | Chain to connect to |
| `rpcUrl` | `string` | chain default | Custom RPC endpoint |
| `signer` | `InvarianceSigner \| Account \| WalletClient \| EIP1193Provider` | from env | Wallet signer |
| `apiKey` | `string` | from env | Managed hosting API key |
| `gasStrategy` | `'standard' \| 'fast' \| 'abstracted'` | `'standard'` | Gas payment strategy |
| `explorerBaseUrl` | `string` | `'https://verify.useinvariance.com'` | Explorer URL prefix |
| `telemetry` | `boolean` | `true` | Enable SDK telemetry |
| `privy` | `{ appId: string; appSecret: string }` | — | Privy embedded wallet config |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `INVARIANCE_PRIVATE_KEY` | Hex private key (auto-converted to viem account) |
| `INVARIANCE_RPC_URL` | JSON-RPC endpoint |
| `INVARIANCE_CHAIN` | `'base'` or `'base-sepolia'` |
| `INVARIANCE_API_KEY` | Managed-mode API key |

### Signer Types

The SDK auto-detects and normalizes these signer types:

- **viem Account** — `privateKeyToAccount('0x...')`
- **viem WalletClient** — from `createWalletClient`
- **EIP-1193 Provider** — MetaMask, Coinbase Wallet, etc.
- **Privy wallet** — via `privy` config option
- **InvarianceSigner** — custom interface

### Supported Chains

| Chain | Chain ID | RPC |
|-------|----------|-----|
| Base (mainnet) | 8453 | `https://mainnet.base.org` |
| Base Sepolia (testnet) | 84532 | `https://sepolia.base.org` |

Contract addresses are auto-resolved via `getContractAddresses(chainId)`.

---

## Core Concepts

### Verification Flow

Every agent action passes through a verification checkpoint:

```
Agent Runtime → Invariance SDK → Base L2 → Indexer → Dashboard
```

1. **Permission Gate** — Does this action fall within defined policy boundaries?
2. **State Gate** — Is the required on-chain state satisfied (escrow funded, approval granted)?
3. **Execution Log** — Immutable record of what happened (actor, action, params, result, timestamp)
4. **Provenance Proof** — Cryptographic link with dual signatures

### Identity

Every actor (agent, human, device, service) needs a registered on-chain identity before executing actions. Identities hold capabilities, attestations, and link to policies.

### Policy

Policies are composable rule sets that define what an actor is allowed to do. Rules include spending caps, action whitelists, time windows, approval requirements, and payment requirements. Policies are attached to identities and evaluated before every intent.

### Intent

The intent protocol handles the full action lifecycle: request → policy check → approve → execute → log → verify. Intents produce cryptographic proofs that anyone can independently verify.

### Escrow

USDC escrow contracts with configurable release conditions: single-arbiter, multi-sig, intent-linked, or milestone-based. Supports disputes and split resolution.

### Ledger

An immutable on-chain event log with dual signatures. Every intent is auto-logged; custom events can also be recorded. Supports querying, streaming, and export.

### Verification

Any transaction executed through Invariance can be independently verified by anyone — no SDK required. Explorer URLs provide public proof pages.

---

## API Reference

### Invariance (Client)

```typescript
const inv = new Invariance(config?: Partial<InvarianceConfig>);
```

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `version` | `string` | SDK version |
| `identity` | `IdentityManager` | Identity module |
| `wallet` | `WalletManager` | Wallet module |
| `intent` | `IntentProtocol` | Intent module |
| `policy` | `PolicyEngine` | Policy module |
| `escrow` | `EscrowManager` | Escrow module |
| `ledger` | `EventLedger` | Ledger module |
| `verify` | `VerifyProxy` | Verify module (also callable directly) |
| `reputation` | `ReputationEngine` | Reputation module |
| `gas` | `GasManager` | Gas module |
| `x402` | `X402Manager` | X402 payments module |
| `erc8004` | `ERC8004Manager` | ERC-8004 module |
| `erc8004Bridge` | `InvarianceBridge` | ERC-8004 bridge module |

**Methods:**

```typescript
inv.ensureWalletInit(): Promise<void>     // Wait for wallet initialization
inv.getConfig(): InvarianceConfig         // Get config object
inv.getChainConfig()                       // Get chain configuration
inv.getContractAddresses()                 // Get all contract addresses
inv.getExplorerBaseUrl(): string           // Get explorer base URL
inv.on(event, listener): () => void        // Subscribe to SDK events
```

---

### Identity

#### `identity.register(opts): Promise<Identity>`

Register an on-chain identity.

```typescript
const agent = await inv.identity.register({
  type: 'agent',              // 'agent' | 'human' | 'device' | 'service'
  owner: '0x...',             // Owner address
  label: 'MyBot',             // Display name
  capabilities: ['swap'],     // Capability tags (optional)
  address: '0x...',           // Identity address (defaults to owner)
  wallet: { create: true },   // Create embedded Privy wallet (optional)
});
```

**Returns:** `Identity`

```typescript
interface Identity {
  identityId: string;
  type: 'agent' | 'human' | 'device' | 'service';
  address: string;
  owner: string;
  label: string;
  capabilities: string[];
  status: 'active' | 'suspended' | 'deactivated';
  attestations: number;
  createdAt: number;
  txHash: string;
  explorerUrl: string;
}
```

#### `identity.get(address): Promise<Identity>`

Fetch identity by wallet address. Throws `IDENTITY_NOT_FOUND` if not registered.

#### `identity.resolve(idOrAddress): Promise<Identity>`

Resolve by ID (bytes32 hex), address (0x...), or string ID.

#### `identity.update(id, opts): Promise<Identity>`

Update label, metadata, or capabilities.

```typescript
await inv.identity.update(id, {
  label: 'NewName',
  metadata: { version: '2.0' },
  capabilities: ['swap', 'bridge'],
});
```

#### `identity.pause(id): Promise<PauseResult>`

Emergency stop. Freezes the identity, revokes all policies, cancels pending intents.

```typescript
const result = await inv.identity.pause(id);
// result: { policiesRevoked, escrowsFrozen, pendingIntentsCancelled }
```

#### `identity.resume(id): Promise<TxReceipt>`

Reactivate a paused identity. Policies must be re-attached manually.

#### `identity.deactivate(id): Promise<TxReceipt>`

Permanently deactivate (irreversible). Policies are revoked and escrows refunded.

#### `identity.list(filters?): Promise<Identity[]>`

Query identities via the indexer.

```typescript
const agents = await inv.identity.list({
  type: 'agent',
  owner: '0x...',
  status: 'active',
  limit: 20,
  offset: 0,
});
```

#### `identity.attest(id, attestation): Promise<Attestation>`

Add a third-party attestation to an identity.

```typescript
await inv.identity.attest(id, {
  claim: 'kyc-verified',
  attester: '0x...',
  evidence: 'ipfs://...',      // Hash or URI (optional)
  expiresAt: 1735689600,       // Unix timestamp (optional)
});
```

#### `identity.attestations(id): Promise<Attestation[]>`

Get all attestations for an identity.

---

### Wallet

#### `wallet.create(opts?): Promise<WalletInfo>`

Create an embedded wallet via Privy. Requires `privy: { appId, appSecret }` in config.

#### `wallet.get(): Promise<WalletInfo>`

Get current wallet info.

```typescript
interface WalletInfo {
  address: string;
  provider: WalletProvider;
  chainId: number;
  connected: boolean;
  isSmartAccount: boolean;
  identityId?: string;
}
```

`WalletProvider`: `'coinbase-wallet' | 'coinbase-smart-wallet' | 'metamask' | 'walletconnect' | 'privy' | 'dynamic' | 'turnkey' | 'safe' | 'ledger' | 'raw' | 'custom'`

#### `wallet.fund(address, opts): Promise<TxReceipt>`

Send USDC or ETH to an address. Executes immediately.

```typescript
await inv.wallet.fund('0x...', {
  amount: '100.50',    // Decimal amount
  token: 'USDC',       // 'USDC' (default)
});
```

#### `wallet.balance(address?): Promise<BalanceInfo>`

Get USDC and ETH balances. Returns `{ usdc: string; eth: string; address: string }`.

#### `wallet.getAddress(): string`

Get the current wallet address.

---

### Intent

#### `intent.request(opts): Promise<IntentResult>`

Full intent lifecycle: request → approve → execute → verify.

```typescript
const result = await inv.intent.request({
  actor: { type: 'agent', address: '0x...' },
  action: 'swap',
  target: '0x...',                    // Target contract (optional)
  amount: '100',                      // Base units integer (e.g., wei), optional
  params: { from: 'USDC', to: 'ETH', amount: '50' },
  approval: 'auto',                   // 'auto' | 'wallet-signature' | 'multi-sig'
  metadata: { source: 'bot-v2' },     // Optional
  payment: {                          // X402 payment (optional)
    enabled: true,
    recipient: '0x...',
    maxCost: '5.00',
  },
});
```

**Returns:** `IntentResult`

```typescript
interface IntentResult {
  intentId: string;
  status: 'completed' | 'pending' | 'rejected';
  actor: ActorReference;
  action: string;
  proof: ProofBundle;
  txHash: string;
  timestamp: number;
  blockNumber: number;
  explorerUrl: string;
  logId: string;
}
```

```typescript
interface ProofBundle {
  proofHash: string;
  signatures: { actor: string; platform?: string; valid: boolean };
  metadataHash: string;
  verifiable: boolean;
  raw: string;  // JSON
}
```

#### `intent.prepare(opts): Promise<PreparedIntent>`

Dry-run an intent without executing.

```typescript
const prepared = await inv.intent.prepare({ ... });
// prepared.wouldSucceed: boolean
// prepared.policyChecks: Array<{ rule, passed, detail }>
// prepared.estimatedGas: GasEstimate
// prepared.warnings: string[]
```

#### `intent.approve(intentId): Promise<ApprovalResult>`

Manually approve a pending intent.

#### `intent.reject(intentId, reason?): Promise<TxReceipt>`

Reject a pending intent.

#### `intent.status(intentId): Promise<IntentStatus>`

Check lifecycle status (lifecycle, actor, action, approvals, proof).

#### `intent.history(filters?): Promise<IntentResult[]>`

Query intent history.

```typescript
const history = await inv.intent.history({
  actor: '0x...',
  action: ['swap', 'transfer'],
  status: 'completed',
  from: '2024-01-01',
  to: '2024-12-31',
  limit: 50,
  offset: 0,
});
```

---

### Policy

#### `policy.create(opts): Promise<SpecPolicy>`

Create a composable policy with rules.

```typescript
const policy = await inv.policy.create({
  name: 'Trading Limits',
  actor: 'agent',                        // ActorType or ActorType[]
  rules: [
    { type: 'max-spend', config: { limit: '1000', period: '30d' } },
    { type: 'action-whitelist', config: { actions: ['swap', 'transfer'] } },
    { type: 'time-window', config: { start: '09:00', end: '17:00', days: ['Mon','Tue','Wed','Thu','Fri'] } },
    { type: 'require-approval', config: { signers: ['0x...'], threshold: 1 } },
    { type: 'require-payment', config: { minAmount: '1.00', exemptActions: ['read'] } },
  ],
  expiry: '2025-12-31',                  // Optional expiration
});
```

**Returns:** `SpecPolicy`

```typescript
interface SpecPolicy {
  policyId: string;
  name: string;
  rules: PolicyRule[];
  actor: ActorType | ActorType[] | null;
  state: 'active' | 'revoked' | 'expired';
  attachedTo: string[];
  createdAt: number;
  expiresAt?: number;
  txHash: string;
}
```

**Rule Types:**

| Type | Config | Description |
|------|--------|-------------|
| `max-spend` | `{ limit: string, period?: string }` | Maximum value (base units integer) |
| `action-whitelist` | `{ actions: string[] }` | Allowed action types |
| `time-window` | `{ start: string, end: string, days?: string[] }` | Time-based access |
| `require-approval` | `{ signers: string[], threshold: number }` | Multi-sig approval |
| `require-payment` | `{ minAmount?: string, exemptActions?: string[] }` | X402 payment required |

#### `policy.attach(policyId, identityId): Promise<TxReceipt>`

Bind a policy to an identity. All actions by that identity will be evaluated against the policy's rules.

#### `policy.detach(policyId, identityId): Promise<TxReceipt>`

Remove a policy from an identity.

#### `policy.evaluate(opts): Promise<EvaluationResult>`

Evaluate an action against a policy without executing.

```typescript
const result = await inv.policy.evaluate({
  policyId: '...',
  actor: { type: 'agent', address: '0x...' },
  action: 'swap',
  amount: '500',               // Base units integer (e.g., wei)
  params: { from: 'USDC', to: 'ETH' },
  paymentReceiptId: '...',     // For require-payment rule (optional)
});
// result.allowed: boolean
// result.ruleResults: Array<{ type, passed, detail, remaining? }>
```

#### `policy.revoke(policyId): Promise<TxReceipt>`

Permanently revoke a policy (irreversible). Auto-detaches from all identities.

#### `policy.status(policyId): Promise<PolicyStatus>`

Get policy status with usage metrics (totalEvaluations, violations, spentByRule).

#### `policy.list(filters?): Promise<SpecPolicy[]>`

Query policies. Filters: `identityId`, `actor`, `state`, `limit`, `offset`.

#### `policy.compose(policyIds): Promise<SpecPolicy>`

Combine two policies into one. Chain calls for more than two.

#### `policy.onViolation(policyId, callback): Unsubscribe`

Subscribe to real-time policy violations.

```typescript
const unsub = inv.policy.onViolation(policyId, (violation) => {
  console.log(violation.action, violation.detail);
});
// later: unsub()
```

---

### Escrow

#### `escrow.create(opts): Promise<EscrowContract>`

Deploy a USDC escrow with conditions.

```typescript
const escrow = await inv.escrow.create({
  amount: '250.00',                           // USDC decimal
  recipient: { type: 'agent', address: '0x...' },
  depositor: { type: 'human', address: '0x...' },  // Defaults to current wallet
  autoFund: true,                             // Auto-fund after creation
  conditions: {
    type: 'milestone',
    milestones: [
      { description: 'Design complete', amount: '100.00' },
      { description: 'Development complete', amount: '150.00' },
    ],
    timeout: '7d',
  },
});
```

**Condition Types:**

| Type | Config | Description |
|------|--------|-------------|
| `single-arbiter` | `{ timeout: string }` | Single arbiter release |
| `multi-sig` | `{ signers: string[], threshold: number, timeoutPerSigner?: string }` | Multi-sig release |
| `intent-linked` | `{ intentId: string, timeout: string }` | Release on intent completion |
| `milestone` | `{ milestones: Array<{ description, amount }>, timeout: string }` | Milestone-based release |

**Returns:** `EscrowContract`

```typescript
interface EscrowContract {
  escrowId: string;
  contractAddress: string;
  depositor: ActorReference;
  recipient: ActorReference;
  amount: string;
  state: EscrowState;      // 'created' | 'funded' | 'released' | 'refunded' | 'disputed'
  conditions: EscrowConditions;
  createdAt: number;
  txHash: string;
  explorerUrl: string;
}
```

#### `escrow.fund(escrowId): Promise<TxReceipt>`

Fund escrow with USDC (2-step: approve + transfer).

#### `escrow.release(escrowId, opts?): Promise<TxReceipt>`

Release funds to recipient.

#### `escrow.refund(escrowId): Promise<TxReceipt>`

Refund to depositor.

#### `escrow.dispute(escrowId, reason): Promise<TxReceipt>`

Open a dispute on the escrow.

#### `escrow.resolve(escrowId, opts): Promise<TxReceipt>`

Resolve a dispute (arbiter only).

```typescript
await inv.escrow.resolve(escrowId, {
  recipientShare: '70',    // percentage
  depositorShare: '30',
});
```

#### `escrow.approve(escrowId): Promise<ApprovalResult>`

Multi-sig approval (one signer). Returns `{ approvalsReceived, thresholdMet, remaining }`.

#### `escrow.approvals(escrowId): Promise<ApprovalStatus>`

Get multi-sig approval status.

#### `escrow.status(escrowId): Promise<EscrowStatus>`

Get escrow status with `timeRemaining`, `disputeReason`, and `approvals`.

#### `escrow.list(filters?): Promise<EscrowContract[]>`

Query escrows. Filters: `depositor`, `recipient`, `state`, `limit`, `offset`.

#### `escrow.onStateChange(escrowId, callback): Unsubscribe`

Subscribe to escrow state changes.

```typescript
const unsub = inv.escrow.onStateChange(escrowId, (change) => {
  console.log(change.previousState, '→', change.newState);
});
```

---

### Ledger

#### `ledger.log(event): Promise<LedgerEntry>`

Log a custom event on-chain with dual signatures.

```typescript
const entry = await inv.ledger.log({
  action: 'data-export',
  actor: { type: 'agent', address: '0x...' },
  category: 'compliance',             // Default: 'custom'
  severity: 'info',                    // 'info' | 'warning' | 'error' | 'critical'
  metadata: { rows: 1500, format: 'csv' },
});
```

**Returns:** `LedgerEntry`

```typescript
interface LedgerEntry {
  entryId: string;
  action: string;
  actor: ActorReference;
  category: string;
  txHash: string;
  blockNumber: number;
  timestamp: number;
  proof: ProofBundle;
  metadataHash: string;
  metadata?: Record<string, unknown>;
  explorerUrl: string;
}
```

#### `ledger.batch(events): Promise<LedgerEntry[]>`

Log multiple events in a single transaction (more gas-efficient).

#### `ledger.query(filters): Promise<LedgerEntry[]>`

Query ledger entries.

```typescript
const entries = await inv.ledger.query({
  actor: '0x...',
  actorType: 'agent',
  action: ['swap', 'transfer'],
  category: 'trading',
  from: '2024-01-01',
  to: '2024-12-31',
  limit: 100,
  offset: 0,
  orderBy: 'timestamp',
  order: 'desc',
});
```

#### `ledger.stream(filters, callback): Unsubscribe`

Real-time stream of new ledger entries matching filters.

#### `ledger.export(filters): Promise<ExportData>`

Export entries as JSON or CSV (limit: 10,000 entries).

```typescript
const data = await inv.ledger.export({ actor: '0x...' });
// data: { format: 'json' | 'csv', data: string, count: number, exportedAt: number }
```

---

### Verify

The verify module is callable directly as `inv.verify(txHash)` and also has sub-methods.

#### `verify(txHash): Promise<VerificationResult>`

Verify a transaction by hash.

```typescript
const result = await inv.verify('0x...');
```

**Returns:** `VerificationResult`

```typescript
interface VerificationResult {
  verified: boolean;
  txHash: string;
  action: string;
  actor: ActorReference;
  timestamp: number;
  blockNumber: number;
  proof: ProofBundle;
  explorerUrl: string;
}
```

#### `verify.action(opts): Promise<VerificationResult>`

Verify by actor and action with optional time range.

```typescript
await inv.verify.action({
  actor: '0x...',
  action: 'swap',
  from: '2024-01-01',
  to: '2024-12-31',
});
```

#### `verify.identity(address): Promise<IdentityVerification>`

Full identity audit.

```typescript
const audit = await inv.verify.identity('0x...');
// audit.identity: Identity
// audit.totalActions: number
// audit.verifiedActions: number
// audit.failedVerifications: number
// audit.actionsByType: Record<string, number>
// audit.totalVolume: string (USDC)
// audit.policyHistory: Array<{ policyId, evaluations, violations }>
// audit.attestations: Attestation[]
// audit.explorerUrl: string
```

#### `verify.escrow(escrowId): Promise<EscrowVerification>`

Full escrow audit trail.

```typescript
const audit = await inv.verify.escrow(escrowId);
// audit.verified: boolean
// audit.timeline: Array<{ event, txHash, timestamp, actor, proof }>
// audit.depositor, audit.recipient, audit.amount, audit.finalState
// audit.explorerUrl: string
```

#### `verify.proof(proofHash): Promise<ProofData>`

Decode and validate a proof by hash.

#### `verify.bulk(txHashes): Promise<VerificationResult[]>`

Batch verify multiple transactions (more efficient than a loop).

```typescript
const results = await inv.verify.bulk(['0x...', '0x...']);
```

#### `verify.url(intentId): string`

Generate a public explorer URL. Anyone can open this URL to independently verify without the SDK.

```typescript
const url = inv.verify.url(intentId);
// https://verify.useinvariance.com/intent/...
```

---

### Reputation

#### `reputation.get(address): Promise<ReputationProfile>`

Full reputation profile including identity, scores, reviews, on-chain metrics, badge, and explorer URL.

#### `reputation.review(opts): Promise<Review>`

Submit a 1–5 star review. Must reference a completed escrow as proof of interaction.

```typescript
await inv.reputation.review({
  target: '0x...',
  escrowId: '...',            // Required
  rating: 5,
  comment: 'Great work',
  categories: {               // Optional, each 1-5
    quality: 5,
    communication: 4,
    speed: 5,
    value: 4,
  },
});
```

Throws `NO_ESCROW_FOR_REVIEW` or `ALREADY_REVIEWED` on invalid state.

#### `reputation.getReviews(address, opts?): Promise<ReviewList>`

Get reviews. Options: `limit`, `offset`, `sortBy` (`'newest' | 'highest' | 'lowest'`).

#### `reputation.score(address): Promise<ReputationScore>`

Get numeric scores only (lighter than full profile).

```typescript
interface ReputationScore {
  overall: number;          // 0-100
  reliability: number;      // 0-100
  speed: number;            // 0-100
  volume: number;           // 0-100
  consistency: number;      // 0-100
  policyCompliance: number; // 0-100
  reviewAverage: number;    // 0-5
  reviewCount: number;
  tier: 'unrated' | 'bronze' | 'silver' | 'gold' | 'platinum';
}
```

#### `reputation.compare(addresses): Promise<ComparisonResult>`

Side-by-side comparison of multiple identities. Returns ranked addresses.

#### `reputation.badge(address): Promise<Badge | null>`

Get earned badge. Badge types: `'verified'` (has attestations), `'trusted'` (50+ verified actions), `'elite'` (95%+ compliance with 100+ actions).

#### `reputation.history(address, opts?): Promise<ScoreHistory>`

Score changes over time.

---

### Gas

#### `gas.estimate(opts): Promise<GasEstimate>`

Estimate gas cost for an action.

```typescript
const estimate = await inv.gas.estimate({
  action: 'swap',
  params: { from: 'USDC', to: 'ETH' },
  target: '0x...',
});
// estimate: { ethCost, usdcCost, gasLimit, gasPrice, strategy }
```

#### `gas.balance(): Promise<GasBalance>`

Get gas-related balances.

```typescript
const bal = await inv.gas.balance();
// bal: { ethBalance, usdcBalance, canAbstract }
// canAbstract = true if gasStrategy='abstracted' AND has USDC
```

---

### X402 Payments

#### `x402.payForAction(opts): Promise<PaymentReceipt>`

Create a USDC payment via the x402 protocol.

```typescript
const receipt = await inv.x402.payForAction({
  action: 'generate-report',
  amount: '1.50',
  recipient: '0x...',
  identityId: '...',
  metadata: { reportType: 'monthly' },
});
```

#### `x402.verifyPayment(receiptId): Promise<PaymentVerification>`

Verify a payment. Returns `{ valid: boolean; receipt?: PaymentReceipt; reason?: string }`.

#### `x402.history(identityId, filters?): Promise<PaymentReceipt[]>`

Query payment history. Filters: `action`, `from`, `to`, `limit`, `offset`.

#### `x402.estimateCost(opts): Promise<PaymentEstimate>`

Estimate cost for an action.

```typescript
const est = await inv.x402.estimateCost({ action: 'generate-report' });
// est: { amount, action, required, breakdown?: { baseCost, gasCost, facilitatorFee } }
```

#### `x402.configure(settings): Promise<void>`

Configure x402 settings.

```typescript
await inv.x402.configure({
  facilitatorUrl: 'https://...',
  defaultRecipient: '0x...',
  maxAutoApprove: '10.00',      // USDC threshold
  usePermit2: true,              // Use Permit2 instead of EIP-3009
});
```

---

### ERC-8004

The ERC-8004 module works standalone — no Invariance contracts required. Implements the ERC-8004 Trustless Agents standard.

```typescript
// Standalone usage
import { ERC8004Manager } from '@invariance/sdk';

const erc8004 = new ERC8004Manager({
  chainId: 84532,
  publicClient,
  walletClient,
  registryAddresses: { identity, reputation, validation },
});
```

Or access via the SDK client: `inv.erc8004`.

#### Identity Methods

```typescript
erc8004.register(agentURI, metadata?): Promise<ERC8004AgentIdentity>
erc8004.getAgent(agentId: bigint): Promise<ERC8004AgentIdentity>
erc8004.setMetadata(agentId, key, value): Promise<TxReceipt>
erc8004.getMetadata(agentId, key): Promise<string>
erc8004.setAgentWallet(agentId, newWallet, deadline, signature): Promise<TxReceipt>
erc8004.setAgentURI(agentId, newURI): Promise<TxReceipt>
erc8004.getGlobalId(agentId): string  // Returns eip155:{chainId}:{registry}:{agentId}
```

#### Reputation Methods

```typescript
erc8004.giveFeedback(opts): Promise<TxReceipt>
// opts: { agentId, value, tag1, tag2?, feedbackURI? }

erc8004.revokeFeedback(agentId, feedbackIndex): Promise<TxReceipt>
erc8004.getSummary(agentId, opts?): Promise<ERC8004ReputationSummary>
// Returns: { count, summaryValue, decimals }

erc8004.readFeedback(agentId, client, index): Promise<ERC8004Feedback>
erc8004.readAllFeedback(agentId): Promise<ERC8004Feedback[]>
```

#### Validation Methods

```typescript
erc8004.requestValidation(opts): Promise<TxReceipt>
// opts: { agentId, validator, requestURI }

erc8004.respondToValidation(opts): Promise<TxReceipt>
// opts: { requestHash, response, responseURI? }

erc8004.getValidationStatus(requestHash): Promise<ERC8004ValidationStatus>
erc8004.getValidationSummary(agentId, opts?): Promise<ERC8004ValidationSummary>
// Returns: { count, avgResponse }
```

---

### ERC-8004 Bridge

Optional bridge between ERC-8004 and Invariance modules. Access via `inv.erc8004Bridge`.

#### Identity Linking

```typescript
// Link Invariance identity to ERC-8004 agent
await inv.erc8004Bridge.linkIdentity(invarianceIdentityId, erc8004AgentId);

// Check link
const linked = await inv.erc8004Bridge.getLinkedIdentity(invarianceIdentityId);

// Unlink
await inv.erc8004Bridge.unlinkIdentity(invarianceIdentityId);
```

#### Reputation Bridging

```typescript
// Pull ERC-8004 reputation into Invariance (normalized to 0-100)
const signal = await inv.erc8004Bridge.pullERC8004Reputation(erc8004AgentId);
// signal: { source: 'erc8004', feedbackCount, averageValue, normalizedScore }

// Push Invariance ledger data as ERC-8004 feedback
await inv.erc8004Bridge.pushFeedbackFromLedger(invarianceIdentityId, erc8004AgentId, {
  tag1: 'reliability',
});
```

#### Validation Bridging

```typescript
// Respond to ERC-8004 validation request using Invariance data
await inv.erc8004Bridge.actAsValidator(erc8004AgentId, requestHash);

// Submit validation request to Invariance
await inv.erc8004Bridge.requestInvarianceValidation(erc8004AgentId, requestURI);
```

---

### Marketplace

#### `marketplace.register(opts): Promise<Listing>`

Register a marketplace listing.

```typescript
const listing = await inv.marketplace.register({
  identity: identityId,
  name: 'Content Writer Bot',
  description: 'AI-powered blog content',
  category: 'content',      // 'content' | 'data' | 'research' | 'trading' | 'security' | 'support' | 'other'
  pricing: { type: 'per-task', amount: '25.00', currency: 'USDC' },
  capabilities: ['write-blog', 'seo-optimize'],
  tags: ['ai', 'content'],
  sla: { maxResponseTime: '1h', uptime: '99.9%', refundPolicy: 'full' },
});
```

#### `marketplace.update(listingId, opts): Promise<Listing>`

Update listing fields.

#### `marketplace.deactivate(listingId): Promise<TxReceipt>`

Hide listing from search. Existing hires remain active.

#### `marketplace.search(query): Promise<SearchResults>`

Search listings with filters.

```typescript
const results = await inv.marketplace.search({
  text: 'content writer',
  category: 'content',
  minRating: 4,
  maxPrice: '50.00',
  capabilities: ['write-blog'],
  sortBy: 'rating',
  page: 1,
  pageSize: 20,
});
// results: { listings, total, page, facets: { categories, actorTypes, priceRange, avgRating } }
```

#### `marketplace.get(listingId): Promise<Listing>`

Get a single listing with full details.

#### `marketplace.featured(opts?): Promise<Listing[]>`

Get top-rated listings. Options: `category`, `limit`.

#### `marketplace.hire(opts): Promise<HireResult>`

Compound operation: creates escrow + policy in a single call.

```typescript
const hire = await inv.marketplace.hire({
  listingId: '...',
  payment: { amount: '100.00' },
  policy: {
    rules: [
      { type: 'action-whitelist', config: { actions: ['write-blog'] } },
    ],
  },
});
// hire: { hireId, escrowId, policyId, listing, status: 'active', explorerUrl }
```

#### `marketplace.complete(hireId, opts?): Promise<CompletionResult>`

Complete a job with optional review.

```typescript
const result = await inv.marketplace.complete(hireId, {
  review: { rating: 5, comment: 'Excellent work' },
});
// result: { hireId, escrowReleased, reviewId, updatedReputation, explorerUrl }
```

---

### Webhooks

> Requires managed hosting (`apiKey`). V1 methods throw `NOT_YET_IMPLEMENTED`.

```typescript
inv.webhooks.register(opts): Promise<Webhook>
inv.webhooks.update(webhookId, opts): Promise<Webhook>
inv.webhooks.delete(webhookId): Promise<void>
inv.webhooks.list(): Promise<Webhook[]>
inv.webhooks.test(webhookId): Promise<WebhookPayload>
inv.webhooks.logs(webhookId, opts?): Promise<DeliveryLog[]>
```

---

## Examples

### Quick Start

See [`examples/quick-start.ts`](../examples/quick-start.ts) — a self-contained ~60-line script that demonstrates register → policy → intent → verify.

```bash
cp sdk/.env.example sdk/.env   # fill in INVARIANCE_PRIVATE_KEY
npx tsx sdk/examples/quick-start.ts
```

### Two-Wallet Demo

See [`examples/two-wallet-demo.ts`](../examples/two-wallet-demo.ts) — Alice (human) hires a bot (agent), the bot executes policy-gated work, and Alice verifies everything on-chain.

```bash
INVARIANCE_PRIVATE_KEY=<alice_key> AGENT_PRIVATE_KEY=<agent_key> \
  npx tsx sdk/examples/two-wallet-demo.ts
```

The demo covers:
1. Two SDK instances with different signers
2. Identity registration for both human and agent
3. Policy creation and attachment
4. Policy evaluation (dry-run)
5. Intent execution with auto-approval
6. Ledger logging with metadata
7. Single and bulk transaction verification
8. Full identity audit

---

## Error Handling

All SDK errors extend `InvarianceError`:

```typescript
import { InvarianceError } from '@invariance/sdk';

try {
  await inv.intent.request({ ... });
} catch (err) {
  if (err instanceof InvarianceError) {
    console.log(err.code);         // Error code string
    console.log(err.message);      // Human-readable message
    console.log(err.explorerUrl);  // Explorer link (if applicable)
    console.log(err.txHash);       // Transaction hash (if applicable)
  }
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `NETWORK_ERROR` | RPC or network failure |
| `WALLET_NOT_CONNECTED` | No signer provided |
| `IDENTITY_NOT_FOUND` | Identity doesn't exist on-chain |
| `POLICY_VIOLATION` | Action blocked by policy rules |
| `ESCROW_NOT_FOUND` | Escrow doesn't exist |
| `ESCROW_WRONG_STATE` | Invalid escrow state transition |
| `INTENT_EXPIRED` | Intent timed out |
| `PAYMENT_REQUIRED` | Action requires x402 payment |
| `PAYMENT_FAILED` | X402 payment failed |
| `PAYMENT_VERIFICATION_FAILED` | Invalid payment receipt |
| `VERIFICATION_FAILED` | Proof validation failed |
| `INVALID_INPUT` | Bad parameters |
| `NO_ESCROW_FOR_REVIEW` | Review requires a completed escrow |
| `ALREADY_REVIEWED` | Duplicate review attempt |

---

## Events

Subscribe to SDK events via `inv.on()`. The returned function unsubscribes.

```typescript
const unsub = inv.on('intent.completed', (data) => {
  console.log('Intent done:', data.intentId, data.txHash);
});

// later: unsub()
```

### Full Event List

| Event | Payload |
|-------|---------|
| `identity.registered` | `{ identityId, address }` |
| `identity.paused` | `{ identityId }` |
| `identity.resumed` | `{ identityId }` |
| `intent.requested` | `{ intentId, action }` |
| `intent.completed` | `{ intentId, txHash }` |
| `intent.rejected` | `{ intentId, reason }` |
| `policy.created` | `{ policyId, name }` |
| `policy.attached` | `{ policyId, identityId }` |
| `policy.detached` | `{ policyId, identityId }` |
| `policy.revoked` | `{ policyId }` |
| `policy.composed` | `{ policyId, name }` |
| `policy.violation` | `{ policyId, action, detail }` |
| `escrow.created` | `{ escrowId, amount }` |
| `escrow.funded` | `{ escrowId }` |
| `escrow.released` | `{ escrowId }` |
| `escrow.disputed` | `{ escrowId, reason }` |
| `ledger.logged` | `{ entryId, action }` |
| `reputation.reviewed` | `{ reviewId, target, rating }` |
| `marketplace.listed` | `{ listingId }` |
| `marketplace.hired` | `{ hireId, listingId }` |
| `webhook.delivered` | `{ webhookId, event }` |
| `payment.completed` | `{ paymentId, action, amount }` |
| `payment.failed` | `{ action, reason }` |
| `erc8004.identity.linked` | `{ invarianceIdentityId, erc8004AgentId }` |
| `erc8004.identity.unlinked` | `{ invarianceIdentityId, erc8004AgentId }` |
| `erc8004.feedback.pushed` | `{ erc8004AgentId, value }` |
| `erc8004.validation.responded` | `{ requestHash, response }` |
| `error` | `{ code, message }` |

---

## Advanced Topics

### Gas Abstraction

Set `gasStrategy: 'abstracted'` to pay gas fees in USDC instead of ETH. The SDK automatically wraps transactions when the wallet has sufficient USDC and `canAbstract` is true.

```typescript
const inv = new Invariance({
  chain: 'base-sepolia',
  gasStrategy: 'abstracted',
});
```

### ERC-8004 Interoperability

The SDK implements the ERC-8004 (Trustless Agents) standard for cross-platform agent identity and reputation. Use the bridge module to sync data between Invariance and any ERC-8004-compliant registry.

### X402 Payment-Gated Actions

Combine `require-payment` policy rules with x402 payments to create pay-per-action agents:

```typescript
// 1. Create policy with payment requirement
const policy = await inv.policy.create({
  name: 'Paid Actions',
  rules: [
    { type: 'require-payment', config: { minAmount: '1.00' } },
  ],
});

// 2. Pay and execute in one call
const result = await inv.intent.request({
  actor: { type: 'human', address: '0x...' },
  action: 'generate-report',
  payment: { enabled: true, recipient: '0x...', maxCost: '5.00' },
});
```

### Policy Composition

Chain policies for complex permission structures:

```typescript
const spending = await inv.policy.create({
  name: 'Spending',
  rules: [{ type: 'max-spend', config: { limit: '1000' } }],
});

const schedule = await inv.policy.create({
  name: 'Schedule',
  rules: [{ type: 'time-window', config: { start: '09:00', end: '17:00' } }],
});

const combined = await inv.policy.compose([spending.policyId, schedule.policyId]);
await inv.policy.attach(combined.policyId, agentIdentityId);
```

### Webhook Signature Verification

```typescript
import { verifyWebhookSignature } from '@invariance/sdk';

const valid = verifyWebhookSignature(payload, signature, secret);
```

---

## Troubleshooting & FAQ

### Common Issues

**"WALLET_NOT_CONNECTED"**
Set `INVARIANCE_PRIVATE_KEY` in your `.env` file, or pass a `signer` in the config.

**"IDENTITY_NOT_FOUND"**
The address has no registered identity. Call `inv.identity.register()` first.

**"POLICY_VIOLATION"**
The action exceeds policy bounds. Use `inv.intent.prepare()` to dry-run and see which rules fail, or `inv.policy.evaluate()` to check a specific policy.

**"ESCROW_WRONG_STATE"**
You're trying an invalid state transition (e.g., releasing an unfunded escrow). Check current state with `inv.escrow.status()`.

**Transaction reverts on-chain**
Check that the wallet has sufficient ETH for gas and USDC for any token transfers. Use `inv.wallet.balance()` to verify.

**Indexer queries return empty results**
The indexer may take a few seconds to index new transactions. If using a local node, ensure the indexer is running and pointed at the correct RPC.

### FAQ

**Q: Do I need ETH for gas?**
Yes, unless you use `gasStrategy: 'abstracted'`, which pays gas in USDC.

**Q: Which chains are supported?**
Base (mainnet, chain ID 8453) and Base Sepolia (testnet, chain ID 84532).

**Q: Can I use the SDK with MetaMask / browser wallets?**
Yes. Pass an EIP-1193 provider as the `signer` config option.

**Q: Are actions verified on-chain or off-chain?**
On-chain. Every intent produces a transaction with cryptographic proofs stored on Base L2.

**Q: Can anyone verify my agent's actions?**
Yes. Share the explorer URL from any `IntentResult` or `VerificationResult`. No SDK or account is needed to verify.

**Q: What happens if the indexer is down?**
Core operations (identity, policy, intent, escrow, ledger, verify) work directly on-chain. Only query/list/history methods require the indexer.

**Q: Is the ERC-8004 module required?**
No. It's fully optional and works independently from the core Invariance modules.
