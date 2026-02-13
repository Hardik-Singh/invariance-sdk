/**
 * invariance_status — Check policy status and remaining budget
 */

import { getInvariance, state } from '../index.js';

interface StatusParams {
  action?: string;
  amount?: string;
}

interface StatusResult {
  address: string | null;
  identityId: string | null;
  policyId: string | null;
  policyActive: boolean;
  balance: { eth: string; usdc: string } | null;
  dryRun: { allowed: boolean; detail?: string } | null;
  message: string;
}

/**
 * Check the agent's current status: wallet, policy, balance, and optionally
 * dry-run a proposed action against the policy.
 */
export async function status(params: StatusParams = {}): Promise<StatusResult> {
  if (!state.agentAddress) {
    return {
      address: null,
      identityId: null,
      policyId: null,
      policyActive: false,
      balance: null,
      dryRun: null,
      message: 'Agent not set up. Call invariance_setup first.',
    };
  }

  const inv = getInvariance();

  // Get wallet balance
  const balance = await inv.wallet.balance();

  // Dry-run policy evaluation if action + amount provided
  let dryRun: { allowed: boolean; detail?: string } | null = null;
  if (state.activePolicyId && params.action && params.amount) {
    const evaluation = await inv.policy.evaluate({
      policyId: state.activePolicyId,
      action: params.action,
      amount: params.amount,
      actor: { type: 'agent', address: state.agentAddress },
    });
    const failedRule = evaluation.ruleResults.find((r) => !r.passed);
    dryRun = {
      allowed: evaluation.allowed,
      detail: failedRule?.detail,
    };
  }

  const parts: string[] = [
    `Wallet: ${state.agentAddress}`,
    `Balance: ${balance.eth} ETH, ${balance.usdc} USDC`,
    state.activePolicyId ? `Policy: ${state.activePolicyId} (active)` : 'Policy: none',
  ];

  if (dryRun) {
    parts.push(
      dryRun.allowed
        ? `Dry-run: ${params.action} ${params.amount} would be ALLOWED`
        : `Dry-run: ${params.action} ${params.amount} would be BLOCKED — ${dryRun.detail}`,
    );
  }

  return {
    address: state.agentAddress,
    identityId: state.agentIdentityId,
    policyId: state.activePolicyId,
    policyActive: state.activePolicyId !== null,
    balance: { eth: balance.eth, usdc: balance.usdc },
    dryRun,
    message: parts.join('\n'),
  };
}
