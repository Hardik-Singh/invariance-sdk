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
