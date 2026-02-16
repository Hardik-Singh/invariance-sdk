import { vi } from 'vitest';
import type { InvarianceConfig } from '@invariance/common';
import { encodeEventTopics, encodeAbiParameters, type Abi } from 'viem';
import { ContractFactory } from '../../src/core/ContractFactory.js';
import { InvarianceEventEmitter } from '../../src/core/EventEmitter.js';
import { Telemetry } from '../../src/core/Telemetry.js';
import { InvarianceIntentAbi } from '../../src/contracts/abis/index.js';
import { InvarianceLedgerAbi } from '../../src/contracts/abis/index.js';
import { InvarianceCompactLedgerAbi } from '../../src/contracts/abis/index.js';
import { InvarianceAtomicVerifierAbi } from '../../src/contracts/abis/index.js';
import { InvarianceReviewAbi } from '../../src/contracts/abis/index.js';

/** Base Sepolia config fixture */
export const BASE_SEPOLIA_CONFIG: InvarianceConfig = {
  chain: 'base-sepolia',
};

/** Base mainnet config fixture */
export const BASE_CONFIG: InvarianceConfig = {
  chain: 'base',
};

/** Create a real ContractFactory with sensible defaults */
export function createContractFactory(
  overrides?: Partial<InvarianceConfig>,
): ContractFactory {
  return new ContractFactory({ ...BASE_SEPOLIA_CONFIG, ...overrides });
}

/** Create a real EventEmitter instance */
export function createEventEmitter(): InvarianceEventEmitter {
  return new InvarianceEventEmitter();
}

/** Create a real Telemetry instance (enabled by default) */
export function createTelemetry(enabled = true): Telemetry {
  return new Telemetry(enabled);
}

/**
 * Create a mock contract object matching the shape returned by ContractFactory.getContract().
 * All read/write methods are vi.fn() stubs.
 */
export function createMockContract(overrides?: {
  read?: Record<string, ReturnType<typeof vi.fn>>;
  write?: Record<string, ReturnType<typeof vi.fn>>;
}) {
  return {
    address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
    abi: [] as readonly unknown[],
    read: {
      resolve: vi.fn(),
      get: vi.fn(),
      getAttestations: vi.fn(),
      identityCount: vi.fn(),
      isActive: vi.fn(),
      ...overrides?.read,
    } as Record<string, ReturnType<typeof vi.fn>>,
    write: {
      register: vi.fn(),
      update: vi.fn(),
      pauseIdentity: vi.fn(),
      resume: vi.fn(),
      deactivate: vi.fn(),
      attest: vi.fn(),
      ...overrides?.write,
    } as Record<string, ReturnType<typeof vi.fn>>,
  };
}

/**
 * Create a mock viem PublicClient with waitForTransactionReceipt.
 */
export function createMockPublicClient(overrides?: {
  receipt?: Partial<{
    transactionHash: `0x${string}`;
    blockNumber: bigint;
    gasUsed: bigint;
    status: 'success' | 'reverted';
    logs: readonly { topics: readonly string[]; data: string }[];
  }>;
}) {
  const defaultReceipt = {
    transactionHash: '0xabc123' as `0x${string}`,
    blockNumber: 100n,
    gasUsed: 21000n,
    status: 'success' as const,
    logs: [{ topics: ['0x0000000000000000000000000000000000000000000000000000000000000000', '0x' + Buffer.from('mock-id').toString('hex').padEnd(64, '0')], data: '0x' }] as { topics: readonly string[]; data: string }[],
    ...overrides?.receipt,
  };

  return {
    waitForTransactionReceipt: vi.fn().mockResolvedValue(defaultReceipt),
    getGasPrice: vi.fn().mockResolvedValue(1000000000n), // 1 gwei
    getBalance: vi.fn().mockResolvedValue(1000000000000000000n), // 1 ETH
    getTransactionReceipt: vi.fn().mockResolvedValue(defaultReceipt),
    watchContractEvent: vi.fn().mockReturnValue(() => { /* unsubscribe */ }),
  };
}

/**
 * Create a mock ContractFactory that returns mock contract and client instances.
 * This bypasses the real viem client initialization.
 *
 * **Returns the factory directly** — not an object with named fields.
 * If you need the underlying mock contract/client references alongside the factory,
 * use {@link createMockSetup} instead.
 */
export function createMockContractFactory(opts?: {
  contract?: ReturnType<typeof createMockContract>;
  publicClient?: ReturnType<typeof createMockPublicClient>;
}) {
  const mockContract = opts?.contract ?? createMockContract();
  const mockPublicClient = opts?.publicClient ?? createMockPublicClient();

  const factory = createContractFactory();

  // Override methods to return mocks
  vi.spyOn(factory, 'getContract').mockReturnValue(mockContract as ReturnType<ContractFactory['getContract']>);
  vi.spyOn(factory, 'getPublicClient').mockReturnValue(mockPublicClient as unknown as ReturnType<ContractFactory['getPublicClient']>);
  vi.spyOn(factory, 'getApiBaseUrl').mockReturnValue('https://api-sepolia.useinvariance.com');
  vi.spyOn(factory, 'getExplorerBaseUrl').mockReturnValue('https://sepolia.basescan.org');
  vi.spyOn(factory, 'getAddress').mockReturnValue('0x1234567890abcdef1234567890abcdef12345678');
  vi.spyOn(factory, 'getWalletClient').mockReturnValue(createMockWalletClient() as unknown as ReturnType<ContractFactory['getWalletClient']>);
  vi.spyOn(factory, 'getWalletAddress').mockReturnValue('0x1111111111111111111111111111111111111111');

  return factory;
}

/**
 * Convenience wrapper that returns the mock factory **and** the underlying
 * mock contract / publicClient references. Use this in test `beforeEach`
 * blocks where you need to stub individual read/write methods.
 */
export function createMockSetup(opts?: {
  contract?: ReturnType<typeof createMockContract>;
  publicClient?: ReturnType<typeof createMockPublicClient>;
}) {
  const mockContract = opts?.contract ?? createMockContract();
  const mockPublicClient = opts?.publicClient ?? createMockPublicClient();
  const factory = createMockContractFactory({ contract: mockContract, publicClient: mockPublicClient });
  return { factory, mockContract, mockPublicClient };
}

/**
 * Create a mock WalletClient for tests that need signing.
 */
export function createMockWalletClient() {
  return {
    account: {
      address: '0x1111111111111111111111111111111111111111' as `0x${string}`,
      type: 'local' as const,
    },
    signMessage: vi.fn().mockResolvedValue('0x' + 'ab'.repeat(65)),
    signTypedData: vi.fn().mockResolvedValue('0x' + 'cd'.repeat(65)),
    getAddresses: vi.fn().mockResolvedValue(['0x1111111111111111111111111111111111111111']),
  };
}

/**
 * Create a properly ABI-encoded mock log for the IntentRequested event.
 */
export function createMockIntentRequestedLog(intentId: `0x${string}`) {
  const topics = encodeEventTopics({
    abi: InvarianceIntentAbi as Abi,
    eventName: 'IntentRequested',
    args: {
      intentId,
      requesterIdentityId: '0x0000000000000000000000000000000000000000000000000000000000000001' as `0x${string}`,
      requester: '0x1111111111111111111111111111111111111111' as `0x${string}`,
    },
  });
  const data = encodeAbiParameters(
    [{ type: 'bytes32' }, { type: 'address' }, { type: 'uint256' }],
    [
      '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
      '0x0000000000000000000000000000000000000000' as `0x${string}`,
      0n,
    ],
  );
  return { topics: topics as readonly string[], data };
}

/**
 * Create a properly ABI-encoded mock log for the EntryLogged event.
 */
export function createMockEntryLoggedLog(entryId: `0x${string}`) {
  const topics = encodeEventTopics({
    abi: InvarianceLedgerAbi as Abi,
    eventName: 'EntryLogged',
    args: {
      entryId,
      actorIdentityId: '0x0000000000000000000000000000000000000000000000000000000000000001' as `0x${string}`,
      actorAddress: '0x1111111111111111111111111111111111111111' as `0x${string}`,
    },
  });
  const data = encodeAbiParameters(
    [{ type: 'string' }, { type: 'string' }, { type: 'uint8' }, { type: 'uint256' }],
    ['test-action', 'custom', 0, 0n],
  );
  return { topics: topics as readonly string[], data };
}

/**
 * Create a properly ABI-encoded mock log for the CompactLedger EntryLogged event.
 */
export function createMockCompactEntryLoggedLog(entryId: `0x${string}`) {
  const topics = encodeEventTopics({
    abi: InvarianceCompactLedgerAbi as Abi,
    eventName: 'EntryLogged',
    args: {
      entryId,
      actorIdentityId: '0x0000000000000000000000000000000000000000000000000000000000000001' as `0x${string}`,
      actorAddress: '0x1111111111111111111111111111111111111111' as `0x${string}`,
    },
  });
  const data = encodeAbiParameters(
    [{ type: 'string' }, { type: 'string' }, { type: 'bytes32' }, { type: 'bytes32' }, { type: 'uint8' }, { type: 'uint256' }],
    ['test-action', 'custom', '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`, '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`, 0, 0n],
  );
  return { topics: topics as readonly string[], data };
}

/**
 * Create a properly ABI-encoded mock log for the AtomicVerification event.
 */
export function createMockAtomicVerificationLog(entryId: `0x${string}`) {
  const topics = encodeEventTopics({
    abi: InvarianceAtomicVerifierAbi as Abi,
    eventName: 'AtomicVerification',
    args: {
      entryId,
      actorIdentityId: '0x0000000000000000000000000000000000000000000000000000000000000001' as `0x${string}`,
      actorAddress: '0x1111111111111111111111111111111111111111' as `0x${string}`,
    },
  });
  const data = encodeAbiParameters(
    [{ type: 'string' }],
    ['test-action'],
  );
  return { topics: topics as readonly string[], data };
}

/**
 * Create a properly ABI-encoded mock log for the ReviewSubmitted event.
 */
export function createMockReviewSubmittedLog(reviewId: `0x${string}`) {
  const topics = encodeEventTopics({
    abi: InvarianceReviewAbi as Abi,
    eventName: 'ReviewSubmitted',
    args: {
      reviewId,
      targetIdentityId: '0x0000000000000000000000000000000000000000000000000000000000000001' as `0x${string}`,
      escrowId: '0x0000000000000000000000000000000000000000000000000000000000000002' as `0x${string}`,
    },
  });
  const data = encodeAbiParameters(
    [{ type: 'address' }, { type: 'uint8' }],
    ['0x1111111111111111111111111111111111111111' as `0x${string}`, 5],
  );
  return { topics: topics as readonly string[], data };
}
