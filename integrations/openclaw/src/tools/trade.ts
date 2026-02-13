/**
 * invariance_trade — Execute a verified, policy-gated crypto trade
 */

import { getInvariance, state } from '../index.js';

interface TradeParams {
  action: 'swap' | 'transfer' | 'bridge';
  from_token: string;
  to_token?: string;
  amount: string;
  to_address?: string;
  chain?: string;
}

interface TradeResult {
  intentId: string;
  txHash: string;
  explorerUrl: string;
  action: string;
  amount: string;
  message: string;
}

interface TradeBlocked {
  blocked: true;
  reason: string;
  rule: string;
  message: string;
}

/**
 * Execute a verified crypto trade through the Invariance intent protocol.
 *
 * The trade passes through on-chain policy checks before execution.
 * If the active policy is violated, the trade is blocked and the agent
 * is told which rule failed.
 */
export async function trade(params: TradeParams): Promise<TradeResult | TradeBlocked> {
  const inv = getInvariance();

  if (!state.agentIdentityId || !state.agentAddress) {
    throw new Error('Agent not set up. Call invariance_setup first.');
  }

  // Validate params based on action type
  if (params.action === 'swap' && !params.to_token) {
    throw new Error('to_token is required for swap actions.');
  }
  if (params.action === 'transfer' && !params.to_address) {
    throw new Error('to_address is required for transfer actions.');
  }
  if (params.action === 'bridge' && (!params.to_token || !params.chain)) {
    throw new Error('to_token and chain are required for bridge actions.');
  }

  // If policy is active, dry-run evaluation first for a better error message
  if (state.activePolicyId) {
    const evaluation = await inv.policy.evaluate({
      policyId: state.activePolicyId,
      action: params.action,
      amount: params.amount,
      actor: { type: 'agent', address: state.agentAddress },
    });

    if (!evaluation.allowed) {
      const failedRule = evaluation.ruleResults.find((r) => !r.passed);
      return {
        blocked: true,
        reason: failedRule?.detail ?? 'Policy violation',
        rule: failedRule?.type ?? 'unknown',
        message: `Trade blocked: ${failedRule?.detail ?? 'Policy violation'}. Rule: ${failedRule?.type ?? 'unknown'}. Adjust the policy or reduce the trade amount.`,
      };
    }
  }

  // Build intent params
  const intentParams: Record<string, string> = {
    from: params.from_token,
    amount: params.amount,
  };

  if (params.to_token) intentParams['to'] = params.to_token;
  if (params.to_address) intentParams['recipient'] = params.to_address;
  if (params.chain) intentParams['chain'] = params.chain;

  // Execute through intent protocol (on-chain policy check + execution + logging)
  const result = await inv.intent.request({
    actor: { type: 'agent', address: state.agentAddress },
    action: params.action,
    params: intentParams,
    approval: 'auto',
  });

  return {
    intentId: result.intentId,
    txHash: result.txHash,
    explorerUrl: result.explorerUrl,
    action: params.action,
    amount: params.amount,
    message: `${params.action} executed: ${params.amount} ${params.from_token}${params.to_token ? ` → ${params.to_token}` : ''}. Verified on-chain at ${result.explorerUrl}`,
  };
}
