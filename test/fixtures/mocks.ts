import { vi } from 'vitest';
import type { InvarianceConfig } from '@invariance/common';
import { ContractFactory } from '../../src/core/ContractFactory.js';
import { InvarianceEventEmitter } from '../../src/core/EventEmitter.js';
import { Telemetry } from '../../src/core/Telemetry.js';

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
    logs: [] as { topics: readonly string[]; data: string }[],
    ...overrides?.receipt,
  };

  return {
    waitForTransactionReceipt: vi.fn().mockResolvedValue(defaultReceipt),
  };
}

/**
 * Create a mock ContractFactory that returns mock contract and client instances.
 * This bypasses the real viem client initialization.
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

  return { factory, mockContract, mockPublicClient };
}
