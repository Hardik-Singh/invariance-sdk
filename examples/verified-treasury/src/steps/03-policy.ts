/**
 * Step 3: Create and Attach Spending Policy
 *
 * Policies are composable sets of rules that constrain what an agent can do.
 * Here we create a policy with three rules:
 *   - max-spend: $1000/day spending cap in USDC
 *   - action-whitelist: Only "swap" and "rebalance" are permitted
 *   - time-window: Weekdays 9am-5pm UTC only
 *
 * Once created, the policy is attached to the agent identity so it is
 * enforced on every intent the agent submits.
 */

import type { Invariance, SpecPolicy, PolicyRule, Identity } from '@invariance/sdk';
import { log } from '../utils/logger.js';

export async function createPolicy(
  inv: Invariance,
  identity: Identity,
): Promise<SpecPolicy> {
  log.step(3, 'Create Spending Policy');

  // Define the three rules
  const rules: PolicyRule[] = [
    {
      type: 'max-spend',
      config: { limit: '1000', period: 'day', currency: 'USDC' },
    },
    {
      type: 'action-whitelist',
      config: { actions: ['swap', 'rebalance'] },
    },
    {
      type: 'time-window',
      config: {
        days: ['mon', 'tue', 'wed', 'thu', 'fri'],
        startHour: 9,
        endHour: 17,
        timezone: 'UTC',
      },
    },
  ];

  log.info('Creating composable policy with 3 rules...');
  for (const rule of rules) {
    log.data(`Rule [${rule.type}]`, JSON.stringify(rule.config));
  }

  const policy = await inv.policy.create({
    name: 'Trading Guardrails',
    description: 'Spending cap + action whitelist + business-hours-only',
    actor: 'agent',
    rules,
  });

  log.success('Policy created on-chain');
  log.data('Policy ID', policy.policyId);
  log.data('Name', policy.name);
  log.data('Rules', String(policy.rules.length));
  log.data('State', policy.state);
  log.data('Tx hash', policy.txHash);

  // Attach the policy to the agent identity
  log.info(`Attaching policy to identity ${identity.identityId}...`);
  await inv.policy.attach(policy.policyId, identity.identityId);

  log.success('Policy attached to agent');
  log.data('Attached to', identity.identityId);

  return policy;
}
