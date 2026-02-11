import type { PolicyRule } from '@invariance/common';
import { policyRuleTypeToEnum, enumToPolicyRuleType } from '../../utils/contract-helpers.js';

/** On-chain representation of a policy rule */
export interface OnChainPolicyRule {
  ruleType: number;
  config: `0x${string}`;
}

/**
 * Serialize a PolicyRule to its on-chain representation.
 * Encodes the config object as ABI-encoded bytes.
 *
 * @param rule - The SDK policy rule
 * @returns The on-chain rule format
 */
export function serializeRule(rule: PolicyRule): OnChainPolicyRule {
  const ruleType = policyRuleTypeToEnum(rule.type);

  // Encode config as bytes based on rule type
  let config: `0x${string}` = '0x';

  if (Object.keys(rule.config).length > 0) {
    // Simple JSON-to-bytes encoding for now
    // In production, this would use proper ABI encoding per rule type
    const configJson = JSON.stringify(rule.config);
    config = `0x${Buffer.from(configJson, 'utf8').toString('hex')}` as `0x${string}`;
  }

  return { ruleType, config };
}

/**
 * Deserialize an on-chain policy rule to the SDK format.
 *
 * @param onChainRule - The on-chain rule tuple
 * @returns The SDK policy rule
 */
export function deserializeRule(onChainRule: OnChainPolicyRule): PolicyRule {
  const type = enumToPolicyRuleType(onChainRule.ruleType);

  // Decode config bytes back to object
  let config: Record<string, unknown> = {};

  if (onChainRule.config && onChainRule.config !== '0x') {
    try {
      const configJson = Buffer.from(onChainRule.config.slice(2), 'hex').toString('utf8');
      config = JSON.parse(configJson) as Record<string, unknown>;
    } catch {
      // If decoding fails, leave config empty
      config = {};
    }
  }

  return { type: type as PolicyRule['type'], config };
}

/**
 * Serialize an array of policy rules.
 *
 * @param rules - Array of SDK policy rules
 * @returns Array of on-chain rule tuples
 */
export function serializeRules(rules: PolicyRule[]): OnChainPolicyRule[] {
  return rules.map(serializeRule);
}

/**
 * Deserialize an array of on-chain policy rules.
 *
 * @param onChainRules - Array of on-chain rule tuples
 * @returns Array of SDK policy rules
 */
export function deserializeRules(onChainRules: OnChainPolicyRule[]): PolicyRule[] {
  return onChainRules.map(deserializeRule);
}
