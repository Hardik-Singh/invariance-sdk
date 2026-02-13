import type { PolicyRule } from '@invariance/common';
import { encodeAbiParameters, decodeAbiParameters } from 'viem';
import { policyRuleTypeToEnum, enumToPolicyRuleType, toBytes32 } from '../../utils/contract-helpers.js';

/**
 * Parse a time value that can be a number (Unix timestamp / seconds),
 * a numeric string, or an HH:MM string (converted to seconds since midnight).
 */
function parseTimeValue(value: string | number): bigint {
  if (typeof value === 'number') return BigInt(value);
  // HH:MM format → seconds since midnight
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    const hours = parseInt(match[1]!, 10);
    const minutes = parseInt(match[2]!, 10);
    if (hours >= 24 || minutes >= 60) {
      throw new Error(`Invalid time value: ${value}. Hours must be 0-23, minutes must be 0-59.`);
    }
    return BigInt(hours * 3600 + minutes * 60);
  }
  return BigInt(value);
}

/** On-chain representation of a policy rule */
export interface OnChainPolicyRule {
  ruleType: number;
  config: `0x${string}`;
}

/** Rule types that encode a single uint256 */
const UINT256_RULE_TYPES = new Set([
  'max-spend',
  'max-per-tx',
  'daily-limit',
  'require-balance',
]);

/** Rule types that encode a bytes32[] (action identifiers) */
const BYTES32_ARRAY_RULE_TYPES = new Set([
  'action-whitelist',
  'action-blacklist',
]);

/** Rule types that encode an address[] */
const ADDRESS_ARRAY_RULE_TYPES = new Set([
  'target-whitelist',
  'target-blacklist',
]);

/**
 * Serialize a PolicyRule to its on-chain representation.
 * Encodes the config object as ABI-encoded bytes matching the contract's expected format.
 *
 * @param rule - The SDK policy rule
 * @returns The on-chain rule format
 */
export function serializeRule(rule: PolicyRule): OnChainPolicyRule {
  const ruleType = policyRuleTypeToEnum(rule.type);

  if (Object.keys(rule.config).length === 0) {
    return { ruleType, config: '0x' };
  }

  let config: `0x${string}`;

  if (UINT256_RULE_TYPES.has(rule.type)) {
    // Contract expects abi.decode(config, (uint256))
    const limit = BigInt((rule.config['limit'] as string | number) ?? 0);
    config = encodeAbiParameters([{ type: 'uint256' }], [limit]);
  } else if (BYTES32_ARRAY_RULE_TYPES.has(rule.type)) {
    // Contract expects abi.decode(config, (bytes32[]))
    const items = (rule.config['actions'] as string[]) ?? [];
    config = encodeAbiParameters(
      [{ type: 'bytes32[]' }],
      [items.map((item) => toBytes32(item))],
    );
  } else if (ADDRESS_ARRAY_RULE_TYPES.has(rule.type)) {
    // Contract expects abi.decode(config, (address[]))
    const addresses = (rule.config['targets'] as `0x${string}`[]) ?? [];
    config = encodeAbiParameters([{ type: 'address[]' }], [addresses]);
  } else if (rule.type === 'time-window') {
    // Contract expects abi.decode(config, (uint256, uint256))
    // Values can be Unix timestamps or HH:MM strings (converted to seconds since midnight)
    const start = parseTimeValue((rule.config['start'] as string | number) ?? 0);
    const end = parseTimeValue((rule.config['end'] as string | number) ?? 0);
    config = encodeAbiParameters(
      [{ type: 'uint256' }, { type: 'uint256' }],
      [start, end],
    );
  } else {
    // Opaque types (cooldown, rate-limit, custom, etc.): keep JSON-to-hex
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

  if (!onChainRule.config || onChainRule.config === '0x') {
    return { type: type as PolicyRule['type'], config: {} };
  }

  let config: Record<string, unknown> = {};

  try {
    if (UINT256_RULE_TYPES.has(type)) {
      const [limit] = decodeAbiParameters([{ type: 'uint256' }], onChainRule.config);
      config = { limit: limit.toString() };
    } else if (BYTES32_ARRAY_RULE_TYPES.has(type)) {
      const [items] = decodeAbiParameters([{ type: 'bytes32[]' }], onChainRule.config);
      config = { actions: [...items] };
    } else if (ADDRESS_ARRAY_RULE_TYPES.has(type)) {
      const [addresses] = decodeAbiParameters([{ type: 'address[]' }], onChainRule.config);
      config = { targets: [...addresses] };
    } else if (type === 'time-window') {
      const [start, end] = decodeAbiParameters(
        [{ type: 'uint256' }, { type: 'uint256' }],
        onChainRule.config,
      );
      config = { start: start.toString(), end: end.toString() };
    } else {
      // Opaque types: try JSON decode
      const configJson = Buffer.from(onChainRule.config.slice(2), 'hex').toString('utf8');
      config = JSON.parse(configJson) as Record<string, unknown>;
    }
  } catch {
    // If decoding fails, leave config empty
    config = {};
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
