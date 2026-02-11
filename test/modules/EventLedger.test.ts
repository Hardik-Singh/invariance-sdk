import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventLedger } from '../../src/modules/ledger/EventLedger.js';
import {
  createMockContractFactory,
  createMockContract,
  createMockPublicClient,
  createEventEmitter,
  createTelemetry,
} from '../fixtures/mocks.js';
import type { InvarianceEventEmitter } from '../../src/core/EventEmitter.js';
import type { Telemetry } from '../../src/core/Telemetry.js';
import type { ContractFactory } from '../../src/core/ContractFactory.js';
import { toBytes32 } from '../../src/utils/contract-helpers.js';

/** Compute event signature the same way the helpers do */
const ENTRY_LOGGED_SIG = '0x' + Buffer.from('EntryLogged(bytes32,bytes32,bytes32,uint8,bytes32)').toString('hex');

describe('EventLedger', () => {
  let factory: ContractFactory;
  let mockLedgerContract: ReturnType<typeof createMockContract>;
  let mockIdentityContract: ReturnType<typeof createMockContract>;
  let mockPublicClient: ReturnType<typeof createMockPublicClient>;
  let events: InvarianceEventEmitter;
  let telemetry: Telemetry;
  let ledger: EventLedger;

  beforeEach(() => {
    mockLedgerContract = createMockContract({
      read: {},
      write: {
        log: vi.fn(),
        logBatch: vi.fn(),
      },
    });

    mockIdentityContract = createMockContract({
      read: {
        resolve: vi.fn(),
      },
    });

    mockPublicClient = createMockPublicClient();
    factory = createMockContractFactory({ contract: mockLedgerContract, publicClient: mockPublicClient });

    const getContractSpy = vi.mocked(factory.getContract);
    getContractSpy.mockImplementation((name: string) => {
      if (name === 'identity') return mockIdentityContract as ReturnType<ContractFactory['getContract']>;
      return mockLedgerContract as ReturnType<ContractFactory['getContract']>;
    });

    events = createEventEmitter();
    telemetry = createTelemetry();
    ledger = new EventLedger(factory, events, telemetry);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('log()', () => {
    it('creates entry with dual signatures and returns LedgerEntry', async () => {
      mockIdentityContract.read.resolve.mockResolvedValue(toBytes32('actor-id'));
      mockLedgerContract.write.log.mockResolvedValue('0xtxhash' as `0x${string}`);

      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        transactionHash: '0xtxhash' as `0x${string}`,
        blockNumber: 200n,
        gasUsed: 50000n,
        status: 'success' as const,
        logs: [{ topics: [ENTRY_LOGGED_SIG, toBytes32('entry-1')], data: '0x' }],
      });

      const result = await ledger.log({
        action: 'model-inference',
        actor: { type: 'agent', address: '0x1111111111111111111111111111111111111111' },
        metadata: { model: 'claude-sonnet', latencyMs: 230 },
      });

      expect(mockLedgerContract.write.log).toHaveBeenCalledOnce();
      expect(result.action).toBe('model-inference');
      expect(result.proof.signatures.actor).toBeTruthy();
      expect(result.proof.signatures.platform).toBeTruthy();
      expect(result.proof.signatures.valid).toBe(true);
      expect(result.explorerUrl).toContain('/tx/');
    });

    it('emits ledger.logged event', async () => {
      const emitSpy = vi.spyOn(events, 'emit');
      mockIdentityContract.read.resolve.mockResolvedValue(toBytes32('actor-id'));
      mockLedgerContract.write.log.mockResolvedValue('0xtxhash' as `0x${string}`);

      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        transactionHash: '0xtxhash' as `0x${string}`,
        blockNumber: 200n,
        gasUsed: 50000n,
        status: 'success' as const,
        logs: [{ topics: [ENTRY_LOGGED_SIG, toBytes32('entry-1')], data: '0x' }],
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
      mockLedgerContract.write.log.mockResolvedValue('0xtxhash' as `0x${string}`);

      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        transactionHash: '0xtxhash' as `0x${string}`,
        blockNumber: 200n,
        gasUsed: 50000n,
        status: 'success' as const,
        logs: [{ topics: [ENTRY_LOGGED_SIG, toBytes32('entry-1')], data: '0x' }],
      });

      const result = await ledger.log({
        action: 'test-action',
        actor: { type: 'agent', address: '0x1111111111111111111111111111111111111111' },
      });

      expect(result.category).toBe('custom');
    });
  });

  describe('batch()', () => {
    it('handles multiple entries in a single transaction', async () => {
      mockIdentityContract.read.resolve.mockResolvedValue(toBytes32('actor-id'));
      mockLedgerContract.write.logBatch.mockResolvedValue('0xtxhash' as `0x${string}`);

      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        transactionHash: '0xtxhash' as `0x${string}`,
        blockNumber: 200n,
        gasUsed: 100000n,
        status: 'success' as const,
        logs: [],
      });

      const result = await ledger.batch([
        { action: 'action-1', actor: { type: 'agent', address: '0x1111111111111111111111111111111111111111' } },
        { action: 'action-2', actor: { type: 'agent', address: '0x1111111111111111111111111111111111111111' } },
      ]);

      expect(mockLedgerContract.write.logBatch).toHaveBeenCalledOnce();
      expect(result).toHaveLength(2);
      expect(result[0]!.action).toBe('action-1');
      expect(result[1]!.action).toBe('action-2');
    });
  });

  describe('query()', () => {
    it('returns empty array when indexer unavailable', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')));

      const result = await ledger.query({ actor: '0xActor' });

      expect(result).toEqual([]);
    });

    it('queries indexer when available', async () => {
      const mockEntries = [{ entryId: 'e1', action: 'swap' }];
      vi.stubGlobal(
        'fetch',
        vi.fn()
          .mockResolvedValueOnce({ ok: true }) // health
          .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockEntries) }),
      );

      const result = await ledger.query({ actor: '0xActor' });

      expect(result).toEqual(mockEntries);
    });
  });

  describe('stream()', () => {
    it('returns unsubscribe function', () => {
      const unsubscribe = ledger.stream({ actor: '0xActor' }, vi.fn());

      expect(typeof unsubscribe).toBe('function');
    });

    it('calls watchContractEvent on publicClient', () => {
      ledger.stream({ actor: '0xActor' }, vi.fn());

      expect(mockPublicClient.watchContractEvent).toHaveBeenCalledOnce();
    });
  });

  describe('export()', () => {
    it('returns JSON format by default', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')));

      const result = await ledger.export({ actor: '0xActor' });

      expect(result.format).toBe('json');
      expect(result.count).toBe(0);
      expect(result.exportedAt).toBeGreaterThan(0);
    });
  });

  describe('getContractAddress()', () => {
    it('returns ledger contract address', () => {
      const addr = ledger.getContractAddress();
      expect(addr).toBe('0x1234567890abcdef1234567890abcdef12345678');
    });
  });

  describe('telemetry', () => {
    it('tracks all method calls', async () => {
      const trackSpy = vi.spyOn(telemetry, 'track');

      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')));
      await ledger.query({ actor: '0x1' });
      await ledger.export({ actor: '0x1' });

      expect(trackSpy).toHaveBeenCalledWith('ledger.query', { hasFilters: true });
      expect(trackSpy).toHaveBeenCalledWith('ledger.export');
    });
  });
});
