import type { ActionInput, IntentHash } from '@invariance/common';
import { createIntentHash } from '@invariance/common';

/**
 * Generate a deterministic intent hash from an action and policy hash.
 * Intent hash = keccak256(JSON.stringify({ action, policyHash }))
 *
 * @param action - The action input
 * @param policyHash - Hash of the policy config
 * @returns The intent hash as a branded string
 */
export function generateIntentHash(
  action: ActionInput,
  policyHash: string
): IntentHash {
  // Create a deterministic string representation
  const data = JSON.stringify({
    type: action.type,
    params: sortObjectKeys(action.params),
    policyHash,
  });

  // Use a simple hash for now (in production, use keccak256)
  const hash = simpleHash(data);
  return createIntentHash(`0x${hash}`);
}

/**
 * Generate a policy hash from policy configuration.
 *
 * @param policies - Array of policies or a single policy config
 * @returns Hash of the policy configuration
 */
export function generatePolicyHash(
  policies: unknown[] | { policies: unknown[] }
): string {
  const policyArray = Array.isArray(policies)
    ? policies
    : policies.policies;

  const data = JSON.stringify(
    policyArray.map((p) => sortObjectKeys(p as Record<string, unknown>))
  );

  return `0x${simpleHash(data)}`;
}

/**
 * Generate a runtime fingerprint from SDK version and optional agent code hash.
 *
 * @param sdkVersion - The SDK version string
 * @param agentCodeHash - Optional hash of the agent code
 * @returns Runtime fingerprint hash
 */
export function generateRuntimeFingerprint(
  sdkVersion: string,
  agentCodeHash?: string
): string {
  const data = JSON.stringify({
    sdkVersion,
    agentCodeHash: agentCodeHash ?? null,
  });

  return `0x${simpleHash(data)}`;
}

/**
 * Sort object keys recursively for deterministic serialization.
 */
function sortObjectKeys(obj: Record<string, unknown>): Record<string, unknown> {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) =>
      typeof item === 'object' && item !== null
        ? sortObjectKeys(item as Record<string, unknown>)
        : item
    ) as unknown as Record<string, unknown>;
  }

  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(obj).sort();

  for (const key of keys) {
    const value = obj[key];
    sorted[key] =
      typeof value === 'object' && value !== null
        ? sortObjectKeys(value as Record<string, unknown>)
        : value;
  }

  return sorted;
}

/**
 * Simple hash function for development/testing.
 * In production, this should use keccak256 from ethers or viem.
 */
function simpleHash(data: string): string {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }

  // Convert to hex and pad to 64 characters
  const hex = Math.abs(hash).toString(16);
  return hex.padStart(64, '0');
}
