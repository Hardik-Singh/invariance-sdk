import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AutoBatchedEventLedgerCompact } from '../AutoBatchedEventLedgerCompact.js';
import type { LedgerEventInput } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(action: string): LedgerEventInput {
  return {
    action,
    actor: { type: 'agent' as const, address: '0xActor' },
    category: 'test',
    metadata: { key: action },
  };
}

const MOCK_IDENTITY_ID = '0x0000000000000000000000000000000000000000000000000000000000000001' as `0x${string}`;
const MOCK_METADATA_HASH = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as `0x${string}`;
const MOCK_SIG = '0xdeadbeef' as `0x${string}`;
const MOCK_TX_HASH = '0xtx123';

function createMocks() {
  const logBatchFn = vi.fn().mockResolvedValue(MOCK_TX_HASH);
  const logFn = vi.fn().mockResolvedValue(MOCK_TX_HASH);

  const contracts = {
    getContract: vi.fn().mockReturnValue({
      read: { resolve: vi.fn().mockResolvedValue(MOCK_IDENTITY_ID) },
      write: { logBatch: logBatchFn, log: logFn },
    }),
    getCompactLedgerDomain: vi.fn().mockReturnValue({ name: 'test', version: '1', chainId: 1, verifyingContract: '0x0' }),
    getWalletClient: vi.fn().mockReturnValue({}),
    getApiKey: vi.fn().mockReturnValue('test-key'),
    getApiBaseUrl: vi.fn().mockReturnValue('https://api.test'),
    getConfirmation: vi.fn().mockReturnValue('confirmed'),
    getReceiptClient: vi.fn().mockReturnValue({}),
    getExplorerBaseUrl: vi.fn().mockReturnValue('https://explorer.test'),
  };

  const events = { emit: vi.fn() };
  const telemetry = { track: vi.fn() };

  return { contracts, events, telemetry, logBatchFn, logFn };
}

/** Flush microtask queue so _prepare() resolves and entries enter the buffer */
async function flushMicrotasks(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

// Stub the helpers that do real crypto
// NOTE: vi.mock is hoisted, so we must use literal values (not const references)
vi.mock('../../../utils/contract-helpers.js', () => ({
  toBytes32: (s: string) => s as `0x${string}`,
  fromBytes32: (s: string) => s,
  waitForReceipt: vi.fn().mockResolvedValue({ txHash: '0xtx123', blockNumber: 42, logs: [] }),
  mapContractError: (err: unknown) => err instanceof Error ? err : new Error(String(err)),
  parseCompactEntryIdFromLogs: vi.fn().mockReturnValue('0xentry1'),
  hashMetadata: vi.fn().mockReturnValue('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'),
  mapSeverity: vi.fn().mockReturnValue(0),
  generateActorSignatureEIP712: vi.fn().mockResolvedValue('0xdeadbeef'),
  generatePlatformAttestationEIP712: vi.fn().mockResolvedValue('0xdeadbeef'),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AutoBatchedEventLedgerCompact', () => {
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(() => {
    vi.useFakeTimers();
    mocks = createMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('auto-flushes when buffer hits maxBatchSize', async () => {
    const batched = new AutoBatchedEventLedgerCompact(
      mocks.contracts as never,
      mocks.events as never,
      mocks.telemetry as never,
      { maxBatchSize: 3, maxWaitMs: 60000 },
    );

    const promises = [
      batched.log(makeEvent('a')),
      batched.log(makeEvent('b')),
      batched.log(makeEvent('c')),
    ];

    // Let _prepare() resolve and timer fire
    await flushMicrotasks();
    await flushMicrotasks();
    const results = await Promise.all(promises);

    expect(results).toHaveLength(3);
    expect(mocks.logBatchFn).toHaveBeenCalledTimes(1);
    expect(results[0]!.action).toBe('a');
    expect(results[2]!.action).toBe('c');

    await batched.destroy();
  });

  it('auto-flushes after maxWaitMs', async () => {
    const batched = new AutoBatchedEventLedgerCompact(
      mocks.contracts as never,
      mocks.events as never,
      mocks.telemetry as never,
      { maxBatchSize: 100, maxWaitMs: 2000 },
    );

    const promise = batched.log(makeEvent('delayed'));

    // Let _prepare() resolve so entry enters buffer
    await flushMicrotasks();
    expect(batched.getBufferSize()).toBe(1);

    // Advance past maxWaitMs
    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;

    expect(result.action).toBe('delayed');
    expect(mocks.logBatchFn).toHaveBeenCalledTimes(1);

    await batched.destroy();
  });

  it('manual flush() works', async () => {
    const batched = new AutoBatchedEventLedgerCompact(
      mocks.contracts as never,
      mocks.events as never,
      mocks.telemetry as never,
      { maxBatchSize: 100, maxWaitMs: 60000 },
    );

    const p1 = batched.log(makeEvent('manual-1'));
    const p2 = batched.log(makeEvent('manual-2'));

    // Let _prepare() resolve
    await flushMicrotasks();

    await batched.flush();
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1!.action).toBe('manual-1');
    expect(r2!.action).toBe('manual-2');
    expect(mocks.logBatchFn).toHaveBeenCalledTimes(1);

    await batched.destroy();
  });

  it('batch error rejects all promises', async () => {
    mocks.logBatchFn.mockRejectedValueOnce(new Error('tx failed'));

    const batched = new AutoBatchedEventLedgerCompact(
      mocks.contracts as never,
      mocks.events as never,
      mocks.telemetry as never,
      { maxBatchSize: 2, maxWaitMs: 60000 },
    );

    const p1 = batched.log(makeEvent('fail-1'));
    const p2 = batched.log(makeEvent('fail-2'));

    // Prevent unhandled rejection warnings
    p1.catch(() => {});
    p2.catch(() => {});

    // Let _prepare() resolve and flush trigger
    await flushMicrotasks();
    await flushMicrotasks();

    await expect(p1).rejects.toThrow('tx failed');
    await expect(p2).rejects.toThrow('tx failed');

    await batched.destroy();
  });

  it('destroy() flushes remaining and blocks new calls', async () => {
    const batched = new AutoBatchedEventLedgerCompact(
      mocks.contracts as never,
      mocks.events as never,
      mocks.telemetry as never,
      { maxBatchSize: 100, maxWaitMs: 60000 },
    );

    const p = batched.log(makeEvent('last'));

    // Let _prepare() resolve so entry enters buffer
    await flushMicrotasks();

    await batched.destroy();
    const result = await p;
    expect(result.action).toBe('last');

    await expect(batched.log(makeEvent('after-destroy'))).rejects.toThrow('destroyed');
  });

  it('enabled: false bypasses batching', async () => {
    const batched = new AutoBatchedEventLedgerCompact(
      mocks.contracts as never,
      mocks.events as never,
      mocks.telemetry as never,
      { enabled: false },
    );

    const result = await batched.log(makeEvent('direct'));

    expect(result.action).toBe('direct');
    expect(mocks.logFn).toHaveBeenCalledTimes(1);
    expect(mocks.logBatchFn).not.toHaveBeenCalled();

    await batched.destroy();
  });
});
