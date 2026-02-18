import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OffchainLedger } from '../modules/ledger/OffchainLedger.js';
import { InMemoryLedgerAdapter } from '../modules/ledger/adapters/InMemoryLedgerAdapter.js';
import type { LedgerAdapter, OffchainLedgerEntry } from '@invariance/common';
import type { InvarianceEventEmitter } from '../core/EventEmitter.js';
import type { Telemetry } from '../core/Telemetry.js';

function createMocks() {
  const events = {
    emit: vi.fn(),
  } as unknown as InvarianceEventEmitter;

  const telemetry = {
    track: vi.fn(),
  } as unknown as Telemetry;

  return { events, telemetry };
}

describe('OffchainLedger', () => {
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks = createMocks();
  });

  describe('with InMemoryLedgerAdapter', () => {
    let ledger: OffchainLedger;
    let adapter: InMemoryLedgerAdapter;

    beforeEach(() => {
      adapter = new InMemoryLedgerAdapter();
      ledger = new OffchainLedger(mocks.events, mocks.telemetry, { adapter, failOpen: false });
    });

    it('logs an entry and returns it', async () => {
      const entry = await ledger.log({
        action: 'model-inference',
        actor: { type: 'agent', address: '0xBot' },
        metadata: { model: 'claude' },
      });

      expect(entry.action).toBe('model-inference');
      expect(entry.actor.address).toBe('0xBot');
      expect(entry.metadata).toEqual({ model: 'claude' });
      expect(entry.entryId).toBeDefined();
      expect(entry.category).toBe('custom');
      expect(entry.severity).toBe('info');
      expect(mocks.events.emit).toHaveBeenCalledWith('ledger.logged', {
        entryId: entry.entryId,
        action: 'model-inference',
      });
      expect(mocks.telemetry.track).toHaveBeenCalledWith('offchain_ledger.log', { action: 'model-inference' });
    });

    it('persists entries in the adapter', async () => {
      await ledger.log({ action: 'a', actor: { type: 'agent', address: '0x1' } });
      await ledger.log({ action: 'b', actor: { type: 'human', address: '0x2' } });

      expect(adapter.entries).toHaveLength(2);
    });

    it('queries entries with filters', async () => {
      await ledger.log({ action: 'a', actor: { type: 'agent', address: '0x1' } });
      await ledger.log({ action: 'b', actor: { type: 'agent', address: '0x1' } });
      await ledger.log({ action: 'a', actor: { type: 'human', address: '0x2' } });

      const results = await ledger.query({ actor: '0x1', action: 'a' });
      expect(results).toHaveLength(1);
      expect(results[0].action).toBe('a');
      expect(results[0].actor.address).toBe('0x1');
    });

    it('queries with limit and order', async () => {
      await ledger.log({ action: 'a', actor: { type: 'agent', address: '0x1' } });
      await ledger.log({ action: 'b', actor: { type: 'agent', address: '0x1' } });
      await ledger.log({ action: 'c', actor: { type: 'agent', address: '0x1' } });

      const results = await ledger.query({ limit: 2, order: 'asc' });
      expect(results).toHaveLength(2);
    });
  });

  describe('with failing adapter', () => {
    const failingAdapter: LedgerAdapter = {
      insert: () => Promise.reject(new Error('db down')),
      query: () => Promise.reject(new Error('db down')),
    };

    it('throws when failOpen is false', async () => {
      const ledger = new OffchainLedger(mocks.events, mocks.telemetry, {
        adapter: failingAdapter,
        failOpen: false,
      });

      await expect(
        ledger.log({ action: 'test', actor: { type: 'agent', address: '0x1' } }),
      ).rejects.toThrow('db down');
    });

    it('returns fallback entry when failOpen is true', async () => {
      const ledger = new OffchainLedger(mocks.events, mocks.telemetry, {
        adapter: failingAdapter,
        failOpen: true,
      });

      const entry = await ledger.log({
        action: 'test-action',
        actor: { type: 'agent', address: '0xFallback' },
      });

      expect(entry.action).toBe('test-action');
      expect(entry.actor.address).toBe('0xFallback');
      expect(entry.entryId).toBeDefined();
      expect(mocks.events.emit).toHaveBeenCalledWith('ledger.logged', {
        entryId: entry.entryId,
        action: 'test-action',
      });
    });

    it('returns empty array on query when failOpen is true', async () => {
      const ledger = new OffchainLedger(mocks.events, mocks.telemetry, {
        adapter: failingAdapter,
        failOpen: true,
      });

      const results = await ledger.query({ action: 'test' });
      expect(results).toEqual([]);
    });
  });
});

describe('InMemoryLedgerAdapter', () => {
  it('filters by actorType', async () => {
    const adapter = new InMemoryLedgerAdapter();
    const entry1: OffchainLedgerEntry = {
      entryId: '1', action: 'a', actor: { type: 'agent', address: '0x1' },
      category: 'custom', severity: 'info', timestamp: 1000, createdAt: '',
    };
    const entry2: OffchainLedgerEntry = {
      entryId: '2', action: 'a', actor: { type: 'human', address: '0x2' },
      category: 'custom', severity: 'info', timestamp: 2000, createdAt: '',
    };
    await adapter.insert(entry1);
    await adapter.insert(entry2);

    const results = await adapter.query({ actorType: 'agent' });
    expect(results).toHaveLength(1);
    expect(results[0].actor.type).toBe('agent');
  });

  it('filters by time range', async () => {
    const adapter = new InMemoryLedgerAdapter();
    await adapter.insert({
      entryId: '1', action: 'a', actor: { type: 'agent', address: '0x1' },
      category: 'custom', severity: 'info', timestamp: 1000, createdAt: '',
    });
    await adapter.insert({
      entryId: '2', action: 'a', actor: { type: 'agent', address: '0x1' },
      category: 'custom', severity: 'info', timestamp: 3000, createdAt: '',
    });

    const results = await adapter.query({ from: 2000 });
    expect(results).toHaveLength(1);
    expect(results[0].entryId).toBe('2');
  });
});
