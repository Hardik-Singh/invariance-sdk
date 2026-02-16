import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventLedgerCompact } from '../../src/modules/ledger/EventLedgerCompact.js';
import {
  createMockContractFactory,
  createMockContract,
  createMockPublicClient,
  createEventEmitter,
  createTelemetry,
  createMockCompactEntryLoggedLog,
} from '../fixtures/mocks.js';
import type { InvarianceEventEmitter } from '../../src/core/EventEmitter.js';
import type { Telemetry } from '../../src/core/Telemetry.js';
import type { ContractFactory } from '../../src/core/ContractFactory.js';
import { toBytes32 } from '../../src/utils/contract-helpers.js';

describe('EventLedgerCompact', () => {
  let factory: ContractFactory;
  let mockCompactLedgerContract: ReturnType<typeof createMockContract>;
  let mockIdentityContract: ReturnType<typeof createMockContract>;
  let mockPublicClient: ReturnType<typeof createMockPublicClient>;
  let events: InvarianceEventEmitter;
  let telemetry: Telemetry;
  let ledger: EventLedgerCompact;

  beforeEach(() => {
    mockCompactLedgerContract = createMockContract({
      read: {},
      write: {
        log: vi.fn(),
      },
    });

    mockIdentityContract = createMockContract({
      read: {
        resolve: vi.fn(),
      },
    });

    mockPublicClient = createMockPublicClient();
    factory = createMockContractFactory({ contract: mockCompactLedgerContract, publicClient: mockPublicClient });

    const getContractSpy = vi.mocked(factory.getContract);
    getContractSpy.mockImplementation((name: string) => {
      if (name === 'identity') return mockIdentityContract as ReturnType<ContractFactory['getContract']>;
      return mockCompactLedgerContract as ReturnType<ContractFactory['getContract']>;
    });

    // Mock getCompactLedgerDomain
    vi.spyOn(factory, 'getCompactLedgerDomain' as keyof ContractFactory).mockReturnValue({
      name: 'InvarianceCompactLedger',
      version: '1',
      chainId: 84532,
      verifyingContract: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
    });

    // Mock getApiKey to return a key (required for CompactLedger)
    vi.spyOn(factory, 'getApiKey').mockReturnValue('inv_test_key');

    // Mock the platform attestation API
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { signature: '0x' + 'ef'.repeat(65) } }),
    }));

    events = createEventEmitter();
    telemetry = createTelemetry();
    ledger = new EventLedgerCompact(factory, events, telemetry);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('log()', () => {
    it('creates entry with EIP-712 dual signatures and returns LedgerEntry', async () => {
      mockIdentityContract.read.resolve.mockResolvedValue(toBytes32('actor-id'));
      mockCompactLedgerContract.write.log.mockResolvedValue('0xtxhash' as `0x${string}`);

      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        transactionHash: '0xtxhash' as `0x${string}`,
        blockNumber: 200n,
        gasUsed: 50000n,
        status: 'success' as const,
        logs: [createMockCompactEntryLoggedLog(toBytes32('entry-1'))],
      });

      const result = await ledger.log({
        action: 'model-inference',
        actor: { type: 'agent', address: '0x1111111111111111111111111111111111111111' },
        metadata: { model: 'claude-sonnet', latencyMs: 230 },
      });

      expect(mockCompactLedgerContract.write.log).toHaveBeenCalledOnce();
      expect(result.action).toBe('model-inference');
      expect(result.proof.signatures.actor).toBeTruthy();
      expect(result.proof.signatures.platform).toBeTruthy();
      expect(result.proof.signatures.valid).toBe(true);
      expect(result.explorerUrl).toContain('/tx/');
    });

    it('passes 3 args to compactLedger.log: input, actorSig, platformSig', async () => {
      mockIdentityContract.read.resolve.mockResolvedValue(toBytes32('actor-id'));
      mockCompactLedgerContract.write.log.mockResolvedValue('0xtxhash' as `0x${string}`);

      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        transactionHash: '0xtxhash' as `0x${string}`,
        blockNumber: 200n,
        gasUsed: 50000n,
        status: 'success' as const,
        logs: [createMockCompactEntryLoggedLog(toBytes32('entry-1'))],
      });

      await ledger.log({
        action: 'test',
        actor: { type: 'agent', address: '0x1111111111111111111111111111111111111111' },
      });

      const callArgs = mockCompactLedgerContract.write.log.mock.calls[0]![0] as unknown[];
      expect(callArgs).toHaveLength(3);
      // First arg: compact input struct
      expect(callArgs[0]).toHaveProperty('actorIdentityId');
      expect(callArgs[0]).toHaveProperty('action', 'test');
      // Second arg: actor EIP-712 signature
      expect(typeof callArgs[1]).toBe('string');
      // Third arg: platform EIP-712 signature
      expect(typeof callArgs[2]).toBe('string');
    });

    it('emits ledger.logged event', async () => {
      const emitSpy = vi.spyOn(events, 'emit');
      mockIdentityContract.read.resolve.mockResolvedValue(toBytes32('actor-id'));
      mockCompactLedgerContract.write.log.mockResolvedValue('0xtxhash' as `0x${string}`);

      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        transactionHash: '0xtxhash' as `0x${string}`,
        blockNumber: 200n,
        gasUsed: 50000n,
        status: 'success' as const,
        logs: [createMockCompactEntryLoggedLog(toBytes32('entry-1'))],
      });

      await ledger.log({
        action: 'model-inference',
        actor: { type: 'agent', address: '0x1111111111111111111111111111111111111111' },
      });

      expect(emitSpy).toHaveBeenCalledWith('ledger.logged', expect.objectContaining({
        action: 'model-inference',
      }));
    });

    it('uses default category "custom" when none provided', async () => {
      mockIdentityContract.read.resolve.mockResolvedValue(toBytes32('actor-id'));
      mockCompactLedgerContract.write.log.mockResolvedValue('0xtxhash' as `0x${string}`);

      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        transactionHash: '0xtxhash' as `0x${string}`,
        blockNumber: 200n,
        gasUsed: 50000n,
        status: 'success' as const,
        logs: [createMockCompactEntryLoggedLog(toBytes32('entry-1'))],
      });

      const result = await ledger.log({
        action: 'test-action',
        actor: { type: 'agent', address: '0x1111111111111111111111111111111111111111' },
      });

      expect(result.category).toBe('custom');
    });
  });

  describe('getContractAddress()', () => {
    it('returns compact ledger contract address', () => {
      const addr = ledger.getContractAddress();
      expect(addr).toBe('0x1234567890abcdef1234567890abcdef12345678');
    });
  });

  describe('API key requirement', () => {
    it('throws when no API key is configured', async () => {
      vi.spyOn(factory, 'getApiKey').mockReturnValue(undefined);
      mockIdentityContract.read.resolve.mockResolvedValue(toBytes32('actor-id'));

      await expect(ledger.log({
        action: 'test',
        actor: { type: 'agent', address: '0x1111111111111111111111111111111111111111' },
      })).rejects.toThrow('CompactLedger requires an API key');
    });
  });
});
