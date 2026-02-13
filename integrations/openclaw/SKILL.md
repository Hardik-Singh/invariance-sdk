# Invariance — On-Chain Guardrails for AI Agents

Invariance adds verified, policy-enforced crypto trading to your OpenClaw agent. Every action is checked against on-chain spending limits before execution — your agent **cannot** bypass them.

## Tools

### invariance_setup

Set up the agent wallet and register an on-chain identity.

**Parameters:**
- `label` (string, optional): Agent name. Default: "OpenClaw Agent"
- `capabilities` (string[], optional): Allowed action types. Default: ["swap", "transfer"]

**Returns:** Agent address, identity ID, and setup confirmation.

---

### invariance_set_policy

Create and attach an on-chain spending policy to the agent.

**Parameters:**
- `daily_limit` (string, required): Maximum daily spend in USD (e.g., "500")
- `allowed_actions` (string[], optional): Permitted action types. Default: ["swap", "transfer"]
- `time_window` (object, optional): Active trading hours `{ start: "09:00", end: "17:00" }`
- `rate_limit` (number, optional): Max operations per hour

**Returns:** Policy ID, on-chain tx hash, and policy summary.

---

### invariance_trade

Execute a verified crypto trade (swap, transfer, or bridge). The trade is checked against the active policy before execution — if it violates any rule, it is blocked.

**Parameters:**
- `action` (string, required): One of "swap", "transfer", "bridge"
- `from_token` (string, required): Source token symbol (e.g., "USDC")
- `to_token` (string, conditional): Destination token (required for swap/bridge)
- `amount` (string, required): Amount in human-readable units (e.g., "100")
- `to_address` (string, conditional): Recipient address (required for transfer)
- `chain` (string, optional): Target chain for bridge actions

**Returns:** Intent ID, tx hash, explorer URL, and verification proof — or a blocked message with the violated rule.

---

### invariance_verify

Verify any transaction's on-chain proof and get a public explorer link.

**Parameters:**
- `tx_hash` (string, required): Transaction hash to verify

**Returns:** Verification status (valid/invalid), block number, timestamp, actor, action details, and explorer URL.

---

### invariance_status

Check the agent's current policy status and remaining budget without executing a trade.

**Parameters:**
- `action` (string, optional): Action to dry-run evaluate (e.g., "swap")
- `amount` (string, optional): Amount to check against limits

**Returns:** Active policy summary, remaining daily budget, total spend today, and whether a proposed action would pass.

## Setup

1. Install: `openclaw install invariance`
2. Set environment variables in `.env` (see `.env.example`)
3. Ask your agent: "Set up my Invariance wallet"
4. Then: "Set my daily spending limit to $500"
5. Trade: "Swap 50 USDC for ETH"

## Security

- Private keys are encrypted at rest using `INVARIANCE_WALLET_PASSWORD`
- All policy checks happen on-chain (Base L2) — cannot be bypassed client-side
- Every action produces an immutable ledger entry with cryptographic provenance
- Public explorer URLs let anyone verify what your agent did
