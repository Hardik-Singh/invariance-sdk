/**
 * invariance_set_policy / invariance_view_policy — On-chain policy management
 */

import type { PolicyRule, PolicyRuleType } from '@invariance/sdk';
import { getInvariance, state } from '../index.js';

interface SetPolicyParams {
  daily_limit: string;
  allowed_actions?: string[];
  time_window?: { start: string; end: string };
  rate_limit?: number;
}

interface PolicyResult {
  policyId: string;
  txHash: string;
  rules: PolicyRule[];
  message: string;
}

/**
 * Create an on-chain spending policy and attach it to the agent.
 *
 * Replaces any previously active policy.
 */
export async function setPolicy(params: SetPolicyParams): Promise<PolicyResult> {
  const inv = getInvariance();

  if (!state.agentIdentityId) {
    throw new Error('Agent not set up. Call invariance_setup first.');
  }

  const allowedActions = params.allowed_actions ?? ['swap', 'transfer'];

  // Build rule set from params
  const rules: PolicyRule[] = [
    { type: 'max-spend' as PolicyRuleType, config: { limit: params.daily_limit, period: '24h' } },
    { type: 'action-whitelist' as PolicyRuleType, config: { actions: allowedActions } },
  ];

  if (params.time_window) {
    rules.push({ type: 'time-window' as PolicyRuleType, config: params.time_window });
  }

  if (params.rate_limit) {
    rules.push({ type: 'rate-limit' as PolicyRuleType, config: { max: params.rate_limit, period: '1h' } });
  }

  // Create policy on-chain
  const policy = await inv.policy.create({
    name: `OpenClaw Policy — $${params.daily_limit}/day`,
    actor: 'agent',
    rules,
  });

  // Attach to agent identity
  await inv.policy.attach(policy.policyId, state.agentIdentityId);
  state.activePolicyId = policy.policyId;

  return {
    policyId: policy.policyId,
    txHash: policy.txHash,
    rules,
    message: `Policy active: max $${params.daily_limit}/day, actions: [${allowedActions.join(', ')}]. All trades will be checked against this policy on-chain.`,
  };
}

interface ViewPolicyResult {
  policyId: string | null;
  status: string;
  rules: PolicyRule[] | null;
  message: string;
}

/**
 * View the currently active policy for the agent.
 */
export async function viewPolicy(): Promise<ViewPolicyResult> {
  if (!state.activePolicyId) {
    return {
      policyId: null,
      status: 'none',
      rules: null,
      message: 'No active policy. Use invariance_set_policy to create one.',
    };
  }

  const inv = getInvariance();
  const policy = await inv.policy.status(state.activePolicyId);

  return {
    policyId: policy.policyId,
    status: policy.state,
    rules: policy.rules,
    message: `Active policy: ${policy.name} (${policy.state})`,
  };
}
