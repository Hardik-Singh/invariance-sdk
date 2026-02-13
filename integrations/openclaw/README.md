# @invariance/openclaw-skill

On-chain guardrails for OpenClaw AI agents. Every crypto trade your agent makes is verified against spending policies enforced on Base L2 — no client-side bypass possible.

## Quick Start

```bash
# Install in OpenClaw
openclaw install invariance

# Set environment variables
cp .env.example .env
# Fill in INVARIANCE_PRIVATE_KEY, INVARIANCE_RPC_URL, INVARIANCE_WALLET_PASSWORD
```

Then tell your agent:

```
"Set up my Invariance wallet"
"Set my daily spending limit to $500, only allow swaps"
"Swap 50 USDC for ETH"
"Check my remaining budget"
"Verify transaction 0x..."
```

## Tools

| Tool | Purpose |
|------|---------|
| `invariance_setup` | Create wallet + register on-chain identity |
| `invariance_set_policy` | Set spending limits, allowed actions, time windows |
| `invariance_trade` | Execute verified swap/transfer/bridge |
| `invariance_verify` | Verify any tx on-chain, get explorer URL |
| `invariance_status` | Check balance, budget remaining, dry-run trades |

## How It Works

```
Agent → invariance_trade() → Policy Check (on-chain) → Execute → Log → Proof
```

1. Agent calls `invariance_trade` instead of raw Bankr tools
2. SDK calls `inv.policy.evaluate()` — checks on-chain spending limits
3. If allowed, executes through `inv.intent.request()` (Request → Approve → Execute → Verify)
4. Every action is logged to an immutable on-chain ledger
5. Returns a public explorer URL for independent verification

## Development

```bash
pnpm install
pnpm build
pnpm typecheck
```

## Architecture

```
src/
├── index.ts           # SDK singleton + state management
├── wallet-store.ts    # AES-256-GCM encrypted wallet persistence
└── tools/
    ├── setup.ts       # invariance_setup
    ├── policy.ts      # invariance_set_policy, invariance_view_policy
    ├── trade.ts       # invariance_trade
    ├── verify.ts      # invariance_verify
    └── status.ts      # invariance_status
```
