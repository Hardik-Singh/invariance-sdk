# Verified Agent Treasury

A CLI walkthrough demonstrating the core Invariance SDK value proposition: policy-gated spending controls for autonomous agents.

## What this does

Walks through 8 steps that show how Invariance acts as a constitutional guardrail for any agent:

| Step | Description |
|------|-------------|
| 1 | Initialize SDK with a wallet on Base Sepolia |
| 2 | Register a "TradingBot" agent identity on-chain |
| 3 | Create a composable policy (spending cap + action whitelist + time window) |
| 4 | Execute a verified $100 USDC-to-ETH swap with dry-run preview |
| 5 | Attempt a "withdraw" action -- blocked by the action whitelist |
| 6 | Attempt a $5,000 swap -- blocked by the $1,000/day spending cap |
| 7 | Log a custom audit event and query the full immutable trail |
| 8 | Cryptographically verify a previous transaction |

## Setup

```bash
# From the monorepo root
pnpm install

# Copy the env template
cp .env.example .env

# Edit .env with your private key and RPC URL
# The default private key is the standard Hardhat/Anvil account #0
```

## Run

```bash
pnpm start
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PRIVATE_KEY` | Hex-encoded private key (with 0x prefix) | Anvil account #0 |
| `RPC_URL` | Base Sepolia RPC endpoint | `https://sepolia.base.org` |

## Project Structure

```
src/
  index.ts              Main orchestrator
  utils/
    logger.ts           Colored CLI output
  steps/
    01-init.ts          SDK initialization
    02-register.ts      Agent identity registration
    03-policy.ts        Policy creation and attachment
    04-execute.ts       Dry-run + verified intent execution
    05-blocked.ts       Action whitelist violation
    06-over-limit.ts    Spending cap violation
    07-audit.ts         Ledger logging and querying
    08-verify.ts        Transaction verification
```

## Notes

- The SDK methods currently throw TODO errors (contract integration pending). This example shows the intended V1 API surface.
- The default private key in `.env.example` is the standard Anvil/Hardhat test account. Never use it with real funds.
- All transactions target Base Sepolia (testnet).
