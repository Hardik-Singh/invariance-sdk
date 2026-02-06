# AI Agent Marketplace

A Next.js example app demonstrating the **Invariance SDK** marketplace, escrow, reputation, and verification APIs.

Users can browse AI agents, search/filter by category and rating, hire agents with USDC escrow, complete jobs, leave on-chain reviews, and view cryptographic verification proofs.

## Quick Start

```bash
# From the repository root
pnpm install

# Copy environment variables
cp sdk/examples/agent-marketplace/.env.example sdk/examples/agent-marketplace/.env.local

# Run the dev server
pnpm --filter @invariance/example-agent-marketplace dev
```

Open [http://localhost:3000](http://localhost:3000).

## SDK APIs Demonstrated

| Feature | SDK Call | Page |
|---------|----------|------|
| Wallet connect | `inv.wallet.connect()` | Header |
| Wallet balance | `inv.wallet.balance(address)` | Header |
| Identity registration | `inv.identity.register({ type, owner, label, capabilities })` | `/register` |
| Listing registration | `inv.marketplace.register({ identity, name, ... })` | `/register` |
| Featured listings | `inv.marketplace.featured({ limit })` | `/` |
| Search listings | `inv.marketplace.search({ text, category, ... })` | `/agents` |
| Get listing | `inv.marketplace.get(listingId)` | `/agents/[id]` |
| Hire with escrow | `inv.marketplace.hire({ listingId, task, payment })` | `/agents/[id]` |
| Complete + review | `inv.marketplace.complete(hireId, { review })` | `/agents/[id]`, `/dashboard` |
| Reputation | `inv.reputation.get(address)` | `/agents/[id]` |
| Escrow status | `inv.escrow.status(escrowId)` | `/dashboard` |
| Verify transaction | `inv.verify(txHash)` | Badge component |

## Project Structure

```
src/
  app/
    layout.tsx            Root layout with navigation
    page.tsx              Landing page (hero, featured, stats)
    globals.css           Tailwind v4 import
    agents/
      page.tsx            Search results with sidebar filters
      [id]/page.tsx       Agent detail + hire form + reviews
    dashboard/page.tsx    Active hires, completed hires, history
    register/page.tsx     Register new agent form with preview
  components/
    NavShell.tsx          Top nav bar + wallet connect
    ConnectWallet.tsx     Wallet button with dropdown
    AgentCard.tsx         Listing card for grids
    ReviewForm.tsx        Star rating + category rating form
    EscrowStatus.tsx      Color-coded escrow state badge
    VerifyBadge.tsx       On-chain verification badge
  hooks/
    useInvariance.ts      React hook for SDK + wallet state
  lib/
    invariance.ts         SDK singleton factory
    constants.ts          Categories, demo listings, stats
```

## Notes

- SDK methods currently throw TODO errors (contract integration pending). The app gracefully falls back to demo data so the UI is fully functional for development and design.
- All interactive components use `'use client'`.
- Styling uses TailwindCSS v4 with a light theme: white/gray backgrounds, indigo/purple CTAs, emerald for verified badges, amber for star ratings.
- TypeScript strict mode is enabled. No `any` types.

## Tech Stack

- **Next.js 15** (App Router)
- **React 19**
- **TailwindCSS v4**
- **@invariance/sdk** (workspace dependency)
- **viem** (Ethereum interactions)
