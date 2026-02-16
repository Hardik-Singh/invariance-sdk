import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AtomicVerifier } from '../../src/modules/verify/AtomicVerifier.js';
import {
  createMockContractFactory,
  createMockContract,
  createMockPublicClient,
  createEventEmitter,
  createTelemetry,
  createMockAtomicVerificationLog,
} from '../fixtures/mocks.js';
import type { InvarianceEventEmitter } from '../../src/core/EventEmitter.js';
import type { Telemetry } from '../../src/core/Telemetry.js';
import type { ContractFactory } from '../../src/core/ContractFactory.js';
import { toBytes32 } from '../../src/utils/contract-helpers.js';

describe('AtomicVerifier', () => {
  let factory: ContractFactory;
  let mockAtomicContract: ReturnType<typeof createMockContract>;
  let mockIdentityContract: ReturnType<typeof createMockContract>;
  let mockPublicClient: ReturnType<typeof createMockPublicClient>;
  let events: InvarianceEventEmitter;
  let telemetry: Telemetry;
  let atomic: AtomicVerifier;

  beforeEach(() => {
    mockAtomicContract = createMockContract({
      read: {},
      write: {
        verifyAndLog: vi.fn(),
      },
    });

    mockIdentityContract = createMockContract({
      read: {
        resolve: vi.fn(),
      },
    });

    mockPublicClient = createMockPublicClient();
    factory = createMockContractFactory({ contract: mockAtomicContract, publicClient: mockPublicClient });

    const getContractSpy = vi.mocked(factory.getContract);
    getContractSpy.mockImplementation((name: string) => {
      if (name === 'identity') return mockIdentityContract as ReturnType<ContractFactory['getContract']>;
      return mockAtomicContract as ReturnType<ContractFactory['getContract']>;
    });

    vi.spyOn(factory, 'getCompactLedgerDomain' as keyof ContractFactory).mockReturnValue({
      name: 'InvarianceCompactLedger',
      version: '1',
      chainId: 84532,
      verifyingContract: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
    });

    vi.spyOn(factory, 'getApiKey').mockReturnValue('inv_test_key');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { signature: '0x' + 'ef'.repeat(65) } }),
    }));

    events = createEventEmitter();
    telemetry = createTelemetry();
    atomic = new AtomicVerifier(factory, events, telemetry);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('verifyAndLog()', () => {
    it('calls atomicVerifier.verifyAndLog with input and dual signatures', async () => {
      mockIdentityContract.read.resolve.mockResolvedValue(toBytes32('actor-id'));
      mockAtomicContract.write.verifyAndLog.mockResolvedValue('0xtxhash' as `0x${string}`);

      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        transactionHash: '0xtxhash' as `0x${string}`,
        blockNumber: 300n,
        gasUsed: 80000n,
        status: 'success' as const,
        logs: [createMockAtomicVerificationLog(toBytes32('entry-1'))],
      });

      const result = await atomic.verifyAndLog({
        action: 'swap',
        actor: { type: 'agent', address: '0x1111111111111111111111111111111111111111' },
        metadata: { from: 'USDC', to: 'ETH' },
      });

      expect(mockAtomicContract.write.verifyAndLog).toHaveBeenCalledOnce();
      expect(result.action).toBe('swap');
      expect(result.proof.signatures.valid).toBe(true);
      expect(result.explorerUrl).toContain('/tx/');
    });

    it('throws when no API key is configured', async () => {
      vi.spyOn(factory, 'getApiKey').mockReturnValue(undefined);
      mockIdentityContract.read.resolve.mockResolvedValue(toBytes32('actor-id'));

      await expect(atomic.verifyAndLog({
        action: 'test',
        actor: { type: 'agent', address: '0x1111111111111111111111111111111111111111' },
      })).rejects.toThrow('CompactLedger requires an API key');
    });

    it('emits ledger.logged event', async () => {
      const emitSpy = vi.spyOn(events, 'emit');
      mockIdentityContract.read.resolve.mockResolvedValue(toBytes32('actor-id'));
      mockAtomicContract.write.verifyAndLog.mockResolvedValue('0xtxhash' as `0x${string}`);

      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        transactionHash: '0xtxhash' as `0x${string}`,
        blockNumber: 300n,
        gasUsed: 80000n,
        status: 'success' as const,
        logs: [createMockAtomicVerificationLog(toBytes32('entry-1'))],
      });

      await atomic.verifyAndLog({
        action: 'swap',
        actor: { type: 'agent', address: '0x1111111111111111111111111111111111111111' },
      });

      expect(emitSpy).toHaveBeenCalledWith('ledger.logged', expect.objectContaining({
        action: 'swap',
      }));
    });
  });

  describe('getContractAddress()', () => {
    it('returns atomic verifier contract address', () => {
      const addr = atomic.getContractAddress();
      expect(addr).toBe('0x1234567890abcdef1234567890abcdef12345678');
    });
  });
});
