import type { ActorType } from '@invariance/common';
import type { PublicClient } from 'viem';
import { ErrorCode } from '@invariance/common';
import { InvarianceError } from '../errors/InvarianceError.js';

/** On-chain ActorType enum values */
const ACTOR_TYPE_MAP: Record<ActorType, number> = {
  agent: 0,
  human: 1,
  device: 2,
  service: 3,
};

const REVERSE_ACTOR_TYPE_MAP: Record<number, ActorType> = {
  0: 'agent',
  1: 'human',
  2: 'device',
  3: 'service',
};

/** On-chain IdentityStatus enum values */
const IDENTITY_STATUS_MAP: Record<number, 'active' | 'suspended' | 'deactivated'> = {
  0: 'active',
  1: 'suspended',
  2: 'deactivated',
};

/**
 * Map SDK actor type string to on-chain uint8 enum value.
 *
 * @param type - The SDK actor type
 * @returns The on-chain enum value
 */
export function actorTypeToEnum(type: ActorType): number {
  const val = ACTOR_TYPE_MAP[type];
  if (val === undefined) {
    throw new InvarianceError(
      ErrorCode.INVALID_ACTOR_TYPE,
      `Unknown actor type: ${type as string}`,
    );
  }
  return val;
}

/**
 * Map on-chain uint8 enum value to SDK actor type string.
 *
 * @param val - The on-chain enum value
 * @returns The SDK actor type
 */
export function enumToActorType(val: number): ActorType {
  const type = REVERSE_ACTOR_TYPE_MAP[val];
  if (!type) {
    throw new InvarianceError(
      ErrorCode.INVALID_ACTOR_TYPE,
      `Unknown on-chain actor type enum: ${val}`,
    );
  }
  return type;
}

/**
 * Map on-chain IdentityStatus uint8 to SDK status string.
 *
 * @param val - The on-chain status enum value
 * @returns The SDK status string
 */
export function identityStatusFromEnum(val: number): 'active' | 'suspended' | 'deactivated' {
  const status = IDENTITY_STATUS_MAP[val];
  if (!status) {
    throw new InvarianceError(
      ErrorCode.IDENTITY_NOT_FOUND,
      `Unknown on-chain identity status enum: ${val}`,
    );
  }
  return status;
}

/**
 * Encode a string ID to bytes32 for on-chain use.
 * If already a 0x-prefixed 66-char hex string, returns as-is.
 * Otherwise, pads the UTF-8 encoded string to 32 bytes.
 *
 * @param id - The string identity ID
 * @returns The bytes32 hex string
 */
export function toBytes32(id: string): `0x${string}` {
  // Already a bytes32 hex string
  if (id.startsWith('0x') && id.length === 66) {
    return id as `0x${string}`;
  }

  // Encode string to bytes32 by padding
  const hex = Buffer.from(id, 'utf8').toString('hex');
  if (hex.length > 64) {
    // If too long, take first 64 hex chars (32 bytes)
    return `0x${hex.slice(0, 64)}`;
  }
  return `0x${hex.padEnd(64, '0')}`;
}

/**
 * Decode a bytes32 hex string back to a string representation.
 * Strips trailing zero bytes.
 *
 * @param bytes - The bytes32 hex string
 * @returns The decoded string
 */
export function fromBytes32(bytes: `0x${string}`): string {
  const hex = bytes.slice(2);
  // Remove trailing zeros (pairs of 00)
  const trimmed = hex.replace(/(00)+$/, '');
  if (trimmed.length === 0) return '';
  return Buffer.from(trimmed, 'hex').toString('utf8');
}

/**
 * Wait for a transaction receipt and verify success.
 *
 * @param publicClient - The viem PublicClient
 * @param txHash - The transaction hash to wait for
 * @returns The transaction receipt
 * @throws {InvarianceError} If the transaction reverted
 */
export async function waitForReceipt(
  publicClient: PublicClient,
  txHash: `0x${string}`,
): Promise<{
  txHash: string;
  blockNumber: number;
  gasUsed: string;
  status: 'success' | 'reverted';
  logs: readonly { topics: readonly string[]; data: string }[];
}> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  const result = {
    txHash: receipt.transactionHash,
    blockNumber: Number(receipt.blockNumber),
    gasUsed: receipt.gasUsed.toString(),
    status: receipt.status as 'success' | 'reverted',
    logs: receipt.logs.map((log) => ({
      topics: log.topics as readonly string[],
      data: log.data,
    })),
  };

  if (receipt.status === 'reverted') {
    throw new InvarianceError(
      ErrorCode.TX_REVERTED,
      `Transaction reverted: ${txHash}`,
      { txHash },
    );
  }

  return result;
}

/** On-chain PolicyState enum values */
const POLICY_STATE_MAP: Record<number, 'active' | 'revoked' | 'expired'> = {
  0: 'active',
  1: 'revoked',
  2: 'expired',
};

/** On-chain PolicyRuleType enum values */
const POLICY_RULE_TYPE_MAP: Record<string, number> = {
  'max-spend': 0,
  'max-per-tx': 1,
  'daily-limit': 2,
  'action-whitelist': 3,
  'action-blacklist': 4,
  'target-whitelist': 5,
  'target-blacklist': 6,
  'time-window': 7,
  'cooldown': 8,
  'rate-limit': 9,
  'require-state': 10,
  'require-balance': 11,
  'require-approval': 12,
  'require-attestation': 13,
  'custom': 14,
};

const REVERSE_POLICY_RULE_TYPE_MAP: Record<number, string> = {
  0: 'max-spend',
  1: 'max-per-tx',
  2: 'daily-limit',
  3: 'action-whitelist',
  4: 'action-blacklist',
  5: 'target-whitelist',
  6: 'target-blacklist',
  7: 'time-window',
  8: 'cooldown',
  9: 'rate-limit',
  10: 'require-state',
  11: 'require-balance',
  12: 'require-approval',
  13: 'require-attestation',
  14: 'custom',
};

/**
 * Map SDK policy rule type string to on-chain uint8 enum value.
 *
 * @param type - The SDK policy rule type
 * @returns The on-chain enum value
 */
export function policyRuleTypeToEnum(type: string): number {
  const val = POLICY_RULE_TYPE_MAP[type];
  if (val === undefined) {
    throw new InvarianceError(
      ErrorCode.POLICY_VIOLATION,
      `Unknown policy rule type: ${type}`,
    );
  }
  return val;
}

/**
 * Map on-chain uint8 enum value to SDK policy rule type string.
 *
 * @param val - The on-chain enum value
 * @returns The SDK policy rule type
 */
export function enumToPolicyRuleType(val: number): string {
  const type = REVERSE_POLICY_RULE_TYPE_MAP[val];
  if (!type) {
    throw new InvarianceError(
      ErrorCode.POLICY_VIOLATION,
      `Unknown on-chain policy rule type enum: ${val}`,
    );
  }
  return type;
}

/**
 * Map on-chain PolicyState uint8 to SDK state string.
 *
 * @param val - The on-chain state enum value
 * @returns The SDK state string
 */
export function policyStateFromEnum(val: number): 'active' | 'revoked' | 'expired' {
  const state = POLICY_STATE_MAP[val];
  if (!state) {
    throw new InvarianceError(
      ErrorCode.POLICY_VIOLATION,
      `Unknown on-chain policy state enum: ${val}`,
    );
  }
  return state;
}

/**
 * Map an array of SDK actor types to on-chain uint8 enum values.
 *
 * @param types - Array of SDK actor types
 * @returns Array of on-chain enum values
 */
export function mapActorTypesToEnums(types: ActorType[]): number[] {
  return types.map(actorTypeToEnum);
}

/** On-chain EscrowState enum values */
const ESCROW_STATE_MAP: Record<number, 'created' | 'funded' | 'active' | 'released' | 'refunded' | 'disputed' | 'resolved'> = {
  0: 'created',
  1: 'funded',
  2: 'active',
  3: 'released',
  4: 'refunded',
  5: 'disputed',
  6: 'resolved',
};

/** On-chain EscrowConditionType enum values */
const ESCROW_CONDITION_TYPE_MAP: Record<string, number> = {
  'task-completion': 0,
  'multi-sig': 1,
  'intent-verified': 2,
  'milestone': 3,
};

const REVERSE_ESCROW_CONDITION_TYPE_MAP: Record<number, 'task-completion' | 'multi-sig' | 'intent-verified' | 'milestone'> = {
  0: 'task-completion',
  1: 'multi-sig',
  2: 'intent-verified',
  3: 'milestone',
};

/**
 * Map SDK escrow condition type string to on-chain uint8 enum value.
 *
 * @param type - The SDK escrow condition type
 * @returns The on-chain enum value
 */
export function escrowConditionTypeToEnum(type: 'task-completion' | 'multi-sig' | 'intent-verified' | 'milestone'): number {
  const val = ESCROW_CONDITION_TYPE_MAP[type];
  if (val === undefined) {
    throw new InvarianceError(
      ErrorCode.ESCROW_WRONG_STATE,
      `Unknown escrow condition type: ${type}`,
    );
  }
  return val;
}

/**
 * Map on-chain uint8 enum value to SDK escrow condition type string.
 *
 * @param val - The on-chain enum value
 * @returns The SDK escrow condition type
 */
export function enumToEscrowConditionType(val: number): 'task-completion' | 'multi-sig' | 'intent-verified' | 'milestone' {
  const type = REVERSE_ESCROW_CONDITION_TYPE_MAP[val];
  if (!type) {
    throw new InvarianceError(
      ErrorCode.ESCROW_WRONG_STATE,
      `Unknown on-chain escrow condition type enum: ${val}`,
    );
  }
  return type;
}

/**
 * Map on-chain EscrowState uint8 to SDK state string.
 *
 * @param val - The on-chain state enum value
 * @returns The SDK state string
 */
export function escrowStateFromEnum(val: number): 'created' | 'funded' | 'active' | 'released' | 'refunded' | 'disputed' | 'resolved' {
  const state = ESCROW_STATE_MAP[val];
  if (state === undefined) {
    throw new InvarianceError(
      ErrorCode.ESCROW_NOT_FOUND,
      `Unknown on-chain escrow state enum: ${val}`,
    );
  }
  return state;
}

/** Known contract error names mapped to SDK error codes */
const CONTRACT_ERROR_MAP: Record<string, ErrorCode> = {
  IdentityNotFound: ErrorCode.IDENTITY_NOT_FOUND,
  NotIdentityOwner: ErrorCode.NOT_AUTHORIZED_SIGNER,
  AddressAlreadyRegistered: ErrorCode.POLICY_VIOLATION,
  IdentityNotActive: ErrorCode.IDENTITY_SUSPENDED,
  IdentityAlreadyDeactivated: ErrorCode.IDENTITY_SUSPENDED,
  IdentityNotSuspended: ErrorCode.IDENTITY_NOT_FOUND,
  InvalidAddress: ErrorCode.IDENTITY_NOT_FOUND,
  AttestationNotFound: ErrorCode.IDENTITY_NOT_FOUND,
  AttestationAlreadyRevoked: ErrorCode.IDENTITY_NOT_FOUND,
  NotAttester: ErrorCode.NOT_AUTHORIZED_SIGNER,
  AccessControlUnauthorizedAccount: ErrorCode.NOT_AUTHORIZED_SIGNER,
  // Escrow-specific errors
  EscrowNotFound: ErrorCode.ESCROW_NOT_FOUND,
  InvalidAmount: ErrorCode.ESCROW_WRONG_STATE,
  InvalidBeneficiary: ErrorCode.ESCROW_WRONG_STATE,
  NotDepositor: ErrorCode.NOT_AUTHORIZED_SIGNER,
  NotBeneficiary: ErrorCode.NOT_AUTHORIZED_SIGNER,
  NotParty: ErrorCode.NOT_AUTHORIZED_SIGNER,
  InvalidState: ErrorCode.ESCROW_WRONG_STATE,
  AlreadyFunded: ErrorCode.ESCROW_WRONG_STATE,
  NotFunded: ErrorCode.ESCROW_WRONG_STATE,
  AlreadyApproved: ErrorCode.ESCROW_WRONG_STATE,
  NotSigner: ErrorCode.NOT_AUTHORIZED_SIGNER,
  ThresholdNotMet: ErrorCode.ESCROW_WRONG_STATE,
  EscrowExpired: ErrorCode.ESCROW_WRONG_STATE,
  DisputeAlreadyExists: ErrorCode.ESCROW_WRONG_STATE,
  DisputeNotFound: ErrorCode.ESCROW_NOT_FOUND,
  DisputeAlreadyResolved: ErrorCode.ESCROW_WRONG_STATE,
  // Policy-specific errors
  PolicyNotFound: ErrorCode.POLICY_VIOLATION,
  PolicyNotActive: ErrorCode.POLICY_VIOLATION,
  PolicyAlreadyAttached: ErrorCode.POLICY_VIOLATION,
  PolicyNotAttached: ErrorCode.POLICY_VIOLATION,
  NotPolicyCreator: ErrorCode.NOT_AUTHORIZED_SIGNER,
  NoRulesProvided: ErrorCode.POLICY_VIOLATION,
  InvalidExpiresAt: ErrorCode.POLICY_VIOLATION,
};

/**
 * Map a viem contract revert error to a typed InvarianceError.
 *
 * @param error - The caught error (typically a viem ContractFunctionRevertedError)
 * @returns An InvarianceError with the appropriate error code
 */
export function mapContractError(error: unknown): InvarianceError {
  if (error instanceof InvarianceError) {
    return error;
  }

  // Handle viem ContractFunctionRevertedError
  if (
    error !== null &&
    typeof error === 'object' &&
    'name' in error &&
    (error as { name: string }).name === 'ContractFunctionRevertedError'
  ) {
    const revertError = error as {
      name: string;
      data?: { errorName?: string };
      message: string;
    };
    const errorName = revertError.data?.errorName;
    if (errorName && errorName in CONTRACT_ERROR_MAP) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return new InvarianceError(CONTRACT_ERROR_MAP[errorName]!, errorName);
    }
    return new InvarianceError(ErrorCode.TX_REVERTED, revertError.message);
  }

  // Generic error fallback
  const message = error instanceof Error ? error.message : 'Unknown contract error';
  return new InvarianceError(ErrorCode.NETWORK_ERROR, message);
}
