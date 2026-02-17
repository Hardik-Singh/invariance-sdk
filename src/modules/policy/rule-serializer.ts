import type { PolicyRule } from '@invariance/common';
import { ErrorCode } from '@invariance/common';
import { encodeAbiParameters, decodeAbiParameters, stringToHex, hexToString } from 'viem';
import { parseBaseUnitAmount } from '../../utils/amounts.js';
import { InvarianceError } from '../../errors/InvarianceError.js';
import { policyRuleTypeToEnum, enumToPolicyRuleType, toBytes32 } from '../../utils/contract-helpers.js';

/**
 * Parse a time value as an hour-of-day (0-23).
 *
 * Accepts:
 * - number (0-23)
 * - numeric string (0-23)
 * - HH:MM string (minutes must be 00)
 */
function parseHourValue(value: string | number): bigint {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0 || value > 23) {
      throw new Error(`Invalid time value: ${value}. Hours must be an integer from 0-23.`);
    }
    return BigInt(value);
  }

  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    const hours = parseInt(match[1]!, 10);
    const minutes = parseInt(match[2]!, 10);
    if (hours < 0 || hours > 23) {
      throw new Error(`Invalid time value: ${value}. Hours must be 0-23.`);
    }
    if (minutes !== 0) {
      throw new Error(`Invalid time value: ${value}. Minutes must be 00 (hour precision only).`);
    }
    return BigInt(hours);
  }

  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 0 || numeric > 23) {
    throw new Error(`Invalid time value: ${value}. Hours must be an integer from 0-23.`);
  }
  return BigInt(numeric);
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

/** Rule types that are encoded as Custom on-chain but need SDK-level decoding */
const CUSTOM_ENCODED_RULE_TYPES = new Set<PolicyRule['type']>([
  'require-payment',
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
    // Canonical key: 'limit' (for spend rules) or 'minBalance' (for require-balance)
    if (rule.config['amount'] !== undefined && rule.config['limit'] === undefined) {
      console.warn(`[Invariance] Deprecation: use "limit" instead of "amount" in ${rule.type} rule config.`);
    }
    if (rule.type === 'require-balance' && rule.config['limit'] !== undefined && rule.config['minBalance'] === undefined) {
      console.warn(`[Invariance] Deprecation: use "minBalance" instead of "limit" in require-balance rule config.`);
    }
    const raw =
      rule.type === 'require-balance'
        ? (rule.config['minBalance'] ?? rule.config['limit'] ?? rule.config['amount'])
        : (rule.config['limit'] ?? rule.config['amount']);
    if (raw === undefined) {
      throw new InvarianceError(
        ErrorCode.INVALID_INPUT,
        `Missing required numeric config for rule type "${rule.type}".`,
      );
    }
    const limit = parseBaseUnitAmount(raw as string | number | bigint, `${rule.type}.limit`);
    config = encodeAbiParameters([{ type: 'uint256' }], [limit]);
  } else if (BYTES32_ARRAY_RULE_TYPES.has(rule.type)) {
    // Contract expects abi.decode(config, (bytes32[]))
    const items = (rule.config['actions'] as string[]) ?? [];
    if (items.length === 0) {
      throw new InvarianceError(
        ErrorCode.INVALID_INPUT,
        `Empty actions array for rule type "${rule.type}". This would block all actions — pass at least one action.`,
      );
    }
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
    // Values are hours (0-23) or HH:MM strings (minutes must be 00)
    const start = parseHourValue((rule.config['start'] as string | number) ?? 0);
    const end = parseHourValue((rule.config['end'] as string | number) ?? 0);
    if (end <= start) {
      throw new InvarianceError(
        ErrorCode.INVALID_INPUT,
        `Invalid time-window: end (${end}) must be greater than start (${start}). This would block all actions.`,
      );
    }
    config = encodeAbiParameters(
      [{ type: 'uint256' }, { type: 'uint256' }],
      [start, end],
    );
  } else {
    // Opaque types (cooldown, rate-limit, custom, etc.): keep JSON-to-hex
    const configJson = CUSTOM_ENCODED_RULE_TYPES.has(rule.type)
      ? JSON.stringify({ ...rule.config, type: rule.type })
      : JSON.stringify(rule.config);
    config = stringToHex(configJson) as `0x${string}`;
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
    const configJson = hexToString(onChainRule.config);
    config = JSON.parse(configJson) as Record<string, unknown>;

    if (type === 'custom') {
      const taggedType = config['type'];
      if (typeof taggedType === 'string' && CUSTOM_ENCODED_RULE_TYPES.has(taggedType as PolicyRule['type'])) {
        const rest = Object.fromEntries(
          Object.entries(config).filter(([key]) => key !== 'type'),
        ) as Record<string, unknown>;
        return { type: taggedType as PolicyRule['type'], config: rest };
      }
    }
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
