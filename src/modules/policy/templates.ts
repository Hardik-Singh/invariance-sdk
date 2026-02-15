/**
 * Pre-built policy templates for common agent use cases.
 *
 * Templates provide sensible defaults that can be customized via overrides.
 *
 * @example
 * ```typescript
 * const policy = await inv.policy.fromTemplate('defi-trading', { expiry: '2025-12-31' });
 * ```
 */
import type { CreatePolicyOptions, PolicyRule } from '@invariance/common';
import type { PolicyTemplate, BuiltInTemplate } from './types.js';

/** Built-in template definitions */
const BUILT_IN_TEMPLATES: Record<BuiltInTemplate, PolicyTemplate> = {
  'conservative-spending': {
    name: 'conservative-spending',
    description: 'Conservative spending limits: $100 daily, business hours only, basic operations',
    builtin: true,
    rules: [
      { type: 'max-spend', config: { amount: '100', period: '24h' } },
      { type: 'time-window', config: { start: '09:00', end: '17:00', timezone: 'UTC' } },
      { type: 'action-whitelist', config: { actions: ['transfer', 'approve', 'query', 'balance'] } },
    ],
  },
  'defi-trading': {
    name: 'defi-trading',
    description: 'DeFi trading profile: $10k daily limit, swap/approve/deposit/withdraw actions',
    builtin: true,
    rules: [
      { type: 'max-spend', config: { amount: '10000', period: '24h' } },
      { type: 'action-whitelist', config: { actions: ['swap', 'approve', 'deposit', 'withdraw', 'query', 'balance'] } },
    ],
  },
  'content-agent': {
    name: 'content-agent',
    description: 'Content management agent: post/edit/delete, no spending, rate limited',
    builtin: true,
    rules: [
      { type: 'max-spend', config: { amount: '0' } },
      { type: 'action-whitelist', config: { actions: ['post', 'edit', 'delete', 'query', 'moderate'] } },
      { type: 'rate-limit', config: { max: 100, window: 'PT1H' } },
    ],
  },
  'research-agent': {
    name: 'research-agent',
    description: 'Read-only research agent: no spending, no writes, query and analysis only',
    builtin: true,
    rules: [
      { type: 'max-spend', config: { amount: '0' } },
      { type: 'action-whitelist', config: { actions: ['query', 'analyze', 'search', 'read', 'export'] } },
    ],
  },
  'full-autonomy': {
    name: 'full-autonomy',
    description: 'Full autonomy: high limits, all actions allowed. Use with caution.',
    builtin: true,
    rules: [
      { type: 'max-spend', config: { amount: '100000', period: '24h' } },
    ],
  },
  'mev-bot': {
    name: 'mev-bot',
    description: 'MEV bot: $50k daily, swap/arbitrage/liquidate/flashloan, high rate limit',
    builtin: true,
    rules: [
      { type: 'max-spend', config: { amount: '50000', period: '24h' } },
      { type: 'action-whitelist', config: { actions: ['swap', 'arbitrage', 'liquidate', 'flashloan'] } },
      { type: 'rate-limit', config: { max: 1000, window: 'PT1H' } },
    ],
  },
  'social-agent': {
    name: 'social-agent',
    description: 'Social agent: no spending, post/reply/moderate, rate limited with cooldown',
    builtin: true,
    rules: [
      { type: 'max-spend', config: { amount: '0' } },
      { type: 'action-whitelist', config: { actions: ['post', 'reply', 'like', 'share', 'moderate', 'report'] } },
      { type: 'rate-limit', config: { max: 200, window: 'PT1H' } },
      { type: 'cooldown', config: { duration: 'PT30S' } },
    ],
  },
  'cross-chain-bridge': {
    name: 'cross-chain-bridge',
    description: 'Cross-chain bridge: $25k daily, bridge/swap/approve/claim operations',
    builtin: true,
    rules: [
      { type: 'max-spend', config: { amount: '25000', period: '24h' } },
      { type: 'action-whitelist', config: { actions: ['bridge', 'swap', 'approve', 'claim', 'query'] } },
    ],
  },
  'payment-delegation': {
    name: 'payment-delegation',
    description: 'Payment delegation: $5k daily, transfer/approve/schedule, business hours only',
    builtin: true,
    rules: [
      { type: 'max-spend', config: { amount: '5000', period: '24h' } },
      { type: 'action-whitelist', config: { actions: ['transfer', 'approve', 'schedule', 'cancel'] } },
      { type: 'time-window', config: { start: '09:00', end: '17:00', timezone: 'UTC' } },
    ],
  },
  'iot-device': {
    name: 'iot-device',
    description: 'IoT device: zero spending, read-only operations, high rate limit',
    builtin: true,
    rules: [
      { type: 'max-spend', config: { amount: '0' } },
      { type: 'action-whitelist', config: { actions: ['read', 'query', 'report', 'ping', 'status'] } },
      { type: 'rate-limit', config: { max: 10000, window: 'PT1H' } },
    ],
  },
  'government-benefits': {
    name: 'government-benefits',
    description: 'Government benefits: $10k daily, distribute/verify/audit, daytime hours',
    builtin: true,
    rules: [
      { type: 'max-spend', config: { amount: '10000', period: '24h' } },
      { type: 'action-whitelist', config: { actions: ['distribute', 'verify-eligibility', 'audit', 'query', 'attest'] } },
      { type: 'time-window', config: { start: '06:00', end: '22:00', timezone: 'UTC' } },
    ],
  },
  'identity-verifier': {
    name: 'identity-verifier',
    description: 'Identity verifier: no spending, verify/revoke/attest/audit, rate limited',
    builtin: true,
    rules: [
      { type: 'max-spend', config: { amount: '0' } },
      { type: 'action-whitelist', config: { actions: ['verify', 'revoke', 'query', 'attest', 'audit'] } },
      { type: 'rate-limit', config: { max: 500, window: 'PT1H' } },
    ],
  },
};

/** Custom templates registered at runtime */
const customTemplates = new Map<string, PolicyTemplate>();

/**
 * Resolve a template by name, checking custom templates first then built-ins.
 */
export function getTemplate(name: string): PolicyTemplate | undefined {
  return customTemplates.get(name) ?? BUILT_IN_TEMPLATES[name as BuiltInTemplate];
}

/**
 * Register a custom template.
 */
export function defineTemplate(name: string, template: Omit<PolicyTemplate, 'name' | 'builtin'>): void {
  customTemplates.set(name, { ...template, name, builtin: false });
}

/**
 * List all available templates (built-in + custom).
 */
export function listTemplates(): Array<{ name: string; description: string; builtin: boolean }> {
  const results: Array<{ name: string; description: string; builtin: boolean }> = [];

  for (const [name, tmpl] of Object.entries(BUILT_IN_TEMPLATES)) {
    results.push({ name, description: tmpl.description, builtin: true });
  }

  for (const [name, tmpl] of customTemplates) {
    results.push({ name, description: tmpl.description, builtin: false });
  }

  return results;
}

/**
 * Build CreatePolicyOptions from a template name with optional overrides.
 */
export function buildPolicyFromTemplate(
  templateName: string,
  overrides?: { expiry?: string; actor?: import('@invariance/common').ActorType | import('@invariance/common').ActorType[]; additionalRules?: PolicyRule[] },
): CreatePolicyOptions {
  const template = getTemplate(templateName);
  if (!template) {
    throw new Error(`Unknown policy template: "${templateName}". Use listTemplates() to see available templates.`);
  }

  const rules: PolicyRule[] = [...template.rules];
  if (overrides?.additionalRules) {
    rules.push(...overrides.additionalRules);
  }

  const opts: CreatePolicyOptions = {
    name: template.name,
    rules,
  };

  if (overrides?.expiry) opts.expiry = overrides.expiry;
  if (overrides?.actor) opts.actor = overrides.actor;

  return opts;
}
