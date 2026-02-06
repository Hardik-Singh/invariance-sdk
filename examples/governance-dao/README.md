# AI Governance DAO

A Next.js example app demonstrating democratic governance for AI agents using the Invariance SDK.

A collective of AI agents operates under human oversight: agent owners propose actions, registered voters approve or reject via on-chain voting, and every action is logged immutably to the Invariance Execution Log.

## Features

- **Proposals** -- Create, vote on, and execute governance proposals (deploy agent, change policy, transfer funds, upgrade contract)
- **Multi-sig Voting** -- On-chain approval flow with configurable quorum and threshold (60% by default)
- **Agent Management** -- View DAO-managed agents, their policies, spending caps, and activity
- **Treasury** -- USDC escrow with multi-sig release conditions
- **Audit Trail** -- Immutable ledger of every action, queryable by actor, action type, and date
- **Verification** -- Cryptographic proof of every executed intent, linked to Base Sepolia explorer

## SDK Integration Points

| Feature | SDK Module | Key Methods |
|---------|-----------|-------------|
| Register DAO members | `inv.identity` | `register()` |
| Create governance policy | `inv.policy` | `create()`, `attach()` |
| Submit proposal | `inv.intent` | `request({ approval: 'multi-sig' })` |
| Vote for/against | `inv.intent` | `approve()`, `reject()` |
| Check vote status | `inv.intent` | `status()` |
| Agent spending policy | `inv.policy` | `create()` with `max-spend`, `action-whitelist` |
| Treasury escrow | `inv.escrow` | `create()`, `status()` |
| Audit log | `inv.ledger` | `log()`, `query()` |
| Verify transactions | `inv.verify` | `verify(txHash)` |

## Getting Started

```bash
# From the monorepo root
pnpm install

# Copy environment variables
cp .env.example .env.local

# Start development server
pnpm --filter @invariance/example-governance-dao dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_RPC_URL` | Base Sepolia RPC endpoint | `https://sepolia.base.org` |
| `NEXT_PUBLIC_CHAIN_ID` | Chain ID | `84532` |

## Project Structure

```
src/
├── app/
│   ├── layout.tsx              # Root layout with sidebar nav
│   ├── Sidebar.tsx             # Sidebar with wallet connect
│   ├── page.tsx                # Dashboard
│   ├── proposals/
│   │   ├── page.tsx            # Proposal list with filters
│   │   ├── new/page.tsx        # Create proposal form
│   │   └── [id]/page.tsx       # Proposal detail + voting
│   ├── agents/
│   │   ├── page.tsx            # Agent list
│   │   └── [id]/page.tsx       # Agent detail + policy
│   └── audit/
│       └── page.tsx            # Full audit trail
├── components/
│   ├── ProposalCard.tsx        # Proposal summary card
│   ├── VoteButton.tsx          # For / Against / Abstain
│   ├── TreasuryPanel.tsx       # Treasury balance + transactions
│   ├── AuditLog.tsx            # Timeline of ledger entries
│   └── PolicyViewer.tsx        # Visual policy rule grid
├── hooks/
│   ├── useInvariance.ts        # SDK lifecycle + wallet connect
│   └── useProposals.ts         # Proposal state management
└── lib/
    ├── invariance.ts           # SDK singleton
    └── dao-config.ts           # DAO constants + demo data
```

## Notes

- The SDK methods currently throw TODO errors (contract integration is pending). The app includes demo/mock data so the UI renders and is interactive even without live contracts.
- Connect a browser wallet (MetaMask, Coinbase Wallet) to trigger real SDK calls against Base Sepolia.
- All SDK calls are wrapped in try/catch with user-facing error messages and optimistic fallbacks.

## Tech Stack

- **Next.js 15** (App Router)
- **React 19**
- **TailwindCSS v4**
- **@invariance/sdk** (workspace dependency)
- **viem** (Ethereum interactions)
