import type { ActorType, ListingCategory } from '@invariance/common';
import type { PricingModel } from '@invariance/common';
import type { PublicClient, WalletClient } from 'viem';
import { keccak256, toHex, decodeEventLog } from 'viem';
import { ErrorCode } from '@invariance/common';
import { InvarianceError } from '../errors/InvarianceError.js';
import { InvarianceIntentAbi } from '../contracts/abis/index.js';
import { InvarianceLedgerAbi } from '../contracts/abis/index.js';
import { InvarianceReviewAbi } from '../contracts/abis/index.js';
import { InvarianceRegistryAbi } from '../contracts/abis/index.js';

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
      ErrorCode.INVALID_INPUT,
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

  // Handle shorter 0x-prefixed hex strings (e.g., addresses) — pad to 32 bytes
  if (id.startsWith('0x') && /^0x[0-9a-fA-F]+$/.test(id)) {
    const hexPart = id.slice(2);
    if (hexPart.length > 64) {
      throw new InvarianceError(
        ErrorCode.INVALID_INPUT,
        `Hex ID exceeds 32 bytes: "${id}". Use a shorter identifier or hash it first.`,
      );
    }
    return `0x${hexPart.padEnd(64, '0')}`;
  }

  // Encode string to bytes32 by padding
  const hex = Buffer.from(id, 'utf8').toString('hex');
  if (hex.length > 64) {
    throw new InvarianceError(
      ErrorCode.INVALID_INPUT,
      `ID exceeds 32 bytes: "${id}" (${hex.length / 2} bytes). Use a shorter identifier or hash it first.`,
    );
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
  const decoded = Buffer.from(trimmed, 'hex').toString('utf8');
  // If decoded string contains replacement characters or non-printable bytes,
  // it's likely a raw hash — return the original hex to ensure round-trip safety
  if (/[\uFFFD]/.test(decoded) || Buffer.from(decoded, 'utf8').toString('hex') !== trimmed) {
    return bytes;
  }
  return decoded;
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
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 60_000 });

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
      ErrorCode.INVALID_INPUT,
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
      ErrorCode.INVALID_INPUT,
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
      ErrorCode.INVALID_INPUT,
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
      ErrorCode.INVALID_INPUT,
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
      ErrorCode.INVALID_INPUT,
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
  AddressAlreadyRegistered: ErrorCode.INVALID_INPUT,
  IdentityNotActive: ErrorCode.IDENTITY_SUSPENDED,
  IdentityAlreadyDeactivated: ErrorCode.IDENTITY_SUSPENDED,
  IdentityNotSuspended: ErrorCode.IDENTITY_NOT_FOUND,
  InvalidAddress: ErrorCode.INVALID_INPUT,
  AttestationNotFound: ErrorCode.IDENTITY_NOT_FOUND,
  AttestationAlreadyRevoked: ErrorCode.IDENTITY_NOT_FOUND,
  NotAttester: ErrorCode.NOT_AUTHORIZED_SIGNER,
  AccessControlUnauthorizedAccount: ErrorCode.NOT_AUTHORIZED_SIGNER,
  // Escrow-specific errors
  EscrowNotFound: ErrorCode.ESCROW_NOT_FOUND,
  InvalidAmount: ErrorCode.INVALID_INPUT,
  InvalidBeneficiary: ErrorCode.INVALID_INPUT,
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
  // Intent-specific errors
  IntentNotFound: ErrorCode.INVALID_INPUT,
  IntentNotPending: ErrorCode.INTENT_REJECTED,
  IntentNotApproved: ErrorCode.INTENT_REJECTED,
  IntentNotExecuting: ErrorCode.INTENT_REJECTED,
  IntentExpiredError: ErrorCode.INTENT_EXPIRED,
  NotRequester: ErrorCode.NOT_AUTHORIZED_SIGNER,
  PolicyDenied: ErrorCode.POLICY_VIOLATION,
  InvalidExpiration: ErrorCode.INVALID_INPUT,
  // Registry-specific errors
  ListingNotFound: ErrorCode.INVALID_INPUT,
  NotListingOwner: ErrorCode.NOT_AUTHORIZED_SIGNER,
  ListingAlreadyInactive: ErrorCode.INVALID_INPUT,
  EmptyName: ErrorCode.INVALID_INPUT,
  // Review-specific errors
  ReviewNotFound: ErrorCode.INVALID_INPUT,
  EscrowNotCompleted: ErrorCode.ESCROW_WRONG_STATE,
  NotEscrowParty: ErrorCode.NOT_AUTHORIZED_SIGNER,
  AlreadyReviewed: ErrorCode.ALREADY_REVIEWED,
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

/*//////////////////////////////////////////////////////////////
                    INTENT PROTOCOL HELPERS
//////////////////////////////////////////////////////////////*/

/** On-chain IntentStatus enum values */
const INTENT_STATUS_MAP: Record<number, 'pending' | 'approved' | 'executing' | 'completed' | 'rejected' | 'expired'> = {
  0: 'pending',
  1: 'approved',
  2: 'executing',
  3: 'completed',
  4: 'rejected',
  5: 'expired',
};

/**
 * Map on-chain IntentStatus uint8 to SDK lifecycle string.
 *
 * @param val - The on-chain status enum value
 * @returns The SDK lifecycle string
 */
export function intentStatusFromEnum(val: number): 'pending' | 'approved' | 'executing' | 'completed' | 'rejected' | 'expired' {
  const status = INTENT_STATUS_MAP[val];
  if (!status) {
    throw new InvarianceError(
      ErrorCode.INVALID_INPUT,
      `Unknown on-chain intent status enum: ${val}`,
    );
  }
  return status;
}

/**
 * Parse intentId from transaction logs.
 * Looks for the IntentRequested event and extracts the intentId.
 *
 * @param logs - Transaction receipt logs
 * @returns The intent ID as bytes32 hex string
 */
export function parseIntentIdFromLogs(logs: readonly { topics: readonly string[]; data: string }[]): `0x${string}` {
  for (const log of logs) {
    try {
      const decoded = decodeEventLog({
        abi: InvarianceIntentAbi,
        data: log.data as `0x${string}`,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      });
      if (decoded.eventName === 'IntentRequested') {
        return (decoded.args as { intentId: `0x${string}` }).intentId;
      }
    } catch {
      continue;
    }
  }

  throw new InvarianceError(
    ErrorCode.TX_REVERTED,
    'IntentRequested event not found in transaction logs',
  );
}

/**
 * Hash metadata object to bytes32 for on-chain storage.
 * Uses keccak256 of JSON-stringified metadata.
 *
 * @param metadata - The metadata object to hash
 * @returns The keccak256 hash as bytes32 hex string
 */
export function hashMetadata(metadata: Record<string, unknown>): `0x${string}` {
  const json = JSON.stringify(metadata);
  return keccak256(toHex(json));
}

/*//////////////////////////////////////////////////////////////
                    EVENT LEDGER HELPERS
//////////////////////////////////////////////////////////////*/

/** On-chain Severity enum values */
const SEVERITY_MAP: Record<'info' | 'warn' | 'error', number> = {
  info: 0,
  warn: 1,
  error: 2,
};

/**
 * Map SDK severity string to on-chain uint8 enum value.
 *
 * @param severity - The SDK severity level
 * @returns The on-chain enum value
 */
export function mapSeverity(severity: 'info' | 'warn' | 'error'): number {
  return SEVERITY_MAP[severity];
}

/**
 * Parse entryId from transaction logs.
 * Looks for the EntryLogged event and extracts the entryId.
 *
 * @param logs - Transaction receipt logs
 * @returns The entry ID as bytes32 hex string
 */
export function parseEntryIdFromLogs(logs: readonly { topics: readonly string[]; data: string }[]): `0x${string}` {
  for (const log of logs) {
    try {
      const decoded = decodeEventLog({
        abi: InvarianceLedgerAbi,
        data: log.data as `0x${string}`,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      });
      if (decoded.eventName === 'EntryLogged') {
        return (decoded.args as { entryId: `0x${string}` }).entryId;
      }
    } catch {
      continue;
    }
  }

  throw new InvarianceError(
    ErrorCode.TX_REVERTED,
    'EntryLogged event not found in transaction logs',
  );
}

/**
 * Generate actor signature for ledger entry.
 * Signs the event payload with the actor's wallet.
 *
 * @param event - The ledger event being signed
 * @param walletClient - The actor's viem WalletClient
 * @returns The actor's signature
 */
export async function generateActorSignature(
  event: { action: string; metadata?: Record<string, unknown> },
  walletClient: WalletClient,
): Promise<string> {
  const message = JSON.stringify({ action: event.action, metadata: event.metadata ?? {} });
  const account = walletClient.account;
  if (!account) {
    // Fallback: deterministic commitment hash when no account is available
    return keccak256(toHex(message));
  }
  return walletClient.signMessage({ account, message });
}

/**
 * Generate platform co-signature for ledger entry.
 * Produces a keccak256 commitment hash of the event.
 *
 * @security WARNING: This is NOT a cryptographic signature. It is a deterministic
 * keccak256 hash with no private key involved. Anyone who knows the event data
 * can reproduce this hash. In production, replace with server-side ECDSA signing
 * using the platform's private key to provide authentic platform attestation.
 *
 * @param event - The ledger event being co-signed
 * @returns The platform's commitment hash (NOT a real signature)
 */
export function generatePlatformCommitment(event: { action: string; metadata?: Record<string, unknown> }): string {
  const payload = JSON.stringify({ action: event.action, metadata: event.metadata ?? {}, platform: 'Invariance' });
  return keccak256(toHex(payload));
}

/**
 * Convert array of ledger entries to CSV format.
 *
 * @param entries - Array of ledger entries
 * @returns CSV-formatted string
 */
export function convertToCSV(entries: Array<{ entryId: string; action: string; timestamp: number; txHash: string }>): string {
  if (entries.length === 0) return 'entryId,action,timestamp,txHash\n';

  const headers = 'entryId,action,timestamp,txHash\n';
  const rows = entries.map((e) => `${e.entryId},${e.action},${e.timestamp},${e.txHash}`).join('\n');
  return headers + rows;
}

/*//////////////////////////////////////////////////////////////
                    REPUTATION ENGINE HELPERS
//////////////////////////////////////////////////////////////*/

/**
 * Parse reviewId from transaction logs.
 * Looks for the ReviewSubmitted event and extracts the reviewId.
 *
 * @param logs - Transaction receipt logs
 * @returns The review ID as bytes32 hex string
 */
export function parseReviewIdFromLogs(logs: readonly { topics: readonly string[]; data: string }[]): `0x${string}` {
  for (const log of logs) {
    try {
      const decoded = decodeEventLog({
        abi: InvarianceReviewAbi,
        data: log.data as `0x${string}`,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      });
      if (decoded.eventName === 'ReviewSubmitted') {
        return (decoded.args as { reviewId: `0x${string}` }).reviewId;
      }
    } catch {
      continue;
    }
  }

  throw new InvarianceError(
    ErrorCode.TX_REVERTED,
    'ReviewSubmitted event not found in transaction logs',
  );
}

/*//////////////////////////////////////////////////////////////
                    MARKETPLACE REGISTRY HELPERS
//////////////////////////////////////////////////////////////*/

/** On-chain ListingCategory enum values */
const LISTING_CATEGORY_MAP: Record<ListingCategory, number> = {
  trading: 0,
  content: 1,
  analysis: 2,
  automation: 3,
  research: 4,
  creative: 5,
  development: 6,
  custom: 7,
};

const REVERSE_LISTING_CATEGORY_MAP: Record<number, ListingCategory> = {
  0: 'trading',
  1: 'content',
  2: 'analysis',
  3: 'automation',
  4: 'research',
  5: 'creative',
  6: 'development',
  7: 'custom',
};

/** On-chain PricingType enum values */
const PRICING_TYPE_MAP: Record<PricingModel['type'], number> = {
  fixed: 0,
  hourly: 1,
  'per-task': 2,
  subscription: 3,
};

const REVERSE_PRICING_TYPE_MAP: Record<number, PricingModel['type']> = {
  0: 'fixed',
  1: 'hourly',
  2: 'per-task',
  3: 'subscription',
};

/**
 * Map SDK listing category string to on-chain uint8 enum value.
 *
 * @param category - The SDK listing category
 * @returns The on-chain enum value
 */
export function listingCategoryToEnum(category: ListingCategory): number {
  const val = LISTING_CATEGORY_MAP[category];
  if (val === undefined) {
    throw new InvarianceError(
      ErrorCode.INVALID_INPUT,
      `Unknown listing category: ${category}`,
    );
  }
  return val;
}

/**
 * Map on-chain uint8 enum value to SDK listing category string.
 *
 * @param val - The on-chain enum value
 * @returns The SDK listing category
 */
export function enumToListingCategory(val: number): ListingCategory {
  const category = REVERSE_LISTING_CATEGORY_MAP[val];
  if (!category) {
    throw new InvarianceError(
      ErrorCode.INVALID_INPUT,
      `Unknown on-chain listing category enum: ${val}`,
    );
  }
  return category;
}

/**
 * Map SDK pricing type string to on-chain uint8 enum value.
 *
 * @param type - The SDK pricing type
 * @returns The on-chain enum value
 */
export function pricingTypeToEnum(type: PricingModel['type']): number {
  const val = PRICING_TYPE_MAP[type];
  if (val === undefined) {
    throw new InvarianceError(
      ErrorCode.INVALID_INPUT,
      `Unknown pricing type: ${type}`,
    );
  }
  return val;
}

/**
 * Map on-chain uint8 enum value to SDK pricing type string.
 *
 * @param val - The on-chain enum value
 * @returns The SDK pricing type
 */
export function enumToPricingType(val: number): PricingModel['type'] {
  const type = REVERSE_PRICING_TYPE_MAP[val];
  if (!type) {
    throw new InvarianceError(
      ErrorCode.INVALID_INPUT,
      `Unknown on-chain pricing type enum: ${val}`,
    );
  }
  return type;
}

/**
 * Parse listingId from transaction logs.
 * Looks for the ListingRegistered event and extracts the listingId.
 *
 * @param logs - Transaction receipt logs
 * @returns The listing ID as bytes32 hex string
 */
export function parseListingIdFromLogs(logs: readonly { topics: readonly string[]; data: string }[]): `0x${string}` {
  for (const log of logs) {
    try {
      const decoded = decodeEventLog({
        abi: InvarianceRegistryAbi,
        data: log.data as `0x${string}`,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      });
      if (decoded.eventName === 'ListingRegistered') {
        return (decoded.args as { listingId: `0x${string}` }).listingId;
      }
    } catch {
      continue;
    }
  }

  throw new InvarianceError(
    ErrorCode.TX_REVERTED,
    'ListingRegistered event not found in transaction logs',
  );
}
