import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditTrail } from '../../src/modules/audit/AuditTrail.js';
import { createEventEmitter, createMockContractFactory, createTelemetry } from '../fixtures/mocks.js';

describe('AuditTrail', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('uses off-chain logging by default when gating actions', async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: 'attempt-1', createdAt: new Date().toISOString() } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: 'success-1', createdAt: new Date().toISOString() } }),
      } as Response);

    const contracts = createMockContractFactory();
    const events = createEventEmitter();
    const telemetry = createTelemetry();
    const ledger = { log: vi.fn() } as unknown as import('../../src/modules/ledger/EventLedger.js').EventLedger;
    const audit = new AuditTrail(contracts, events, telemetry, ledger);

    const output = await audit.gate(
      {
        action: 'agent.swap',
        actor: { type: 'agent', address: '0x1111111111111111111111111111111111111111' },
      },
      async () => 'ok',
    );

    expect(output.mode).toBe('offchain');
    expect(output.result).toBe('ok');
    expect(output.offchain?.attemptId).toBe('attempt-1');
    expect(output.offchain?.successId).toBe('success-1');
    expect(ledger.log).not.toHaveBeenCalled();
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('allows explicit on-chain mode while preserving same gate API', async () => {
    const contracts = createMockContractFactory();
    const events = createEventEmitter();
    const telemetry = createTelemetry();
    const ledger = {
      log: vi.fn().mockResolvedValue({ entryId: 'entry-1' }),
    } as unknown as import('../../src/modules/ledger/EventLedger.js').EventLedger;
    const audit = new AuditTrail(contracts, events, telemetry, ledger, { mode: 'offchain' });

    const output = await audit.gate(
      {
        action: 'agent.swap',
        actor: { type: 'agent', address: '0x1111111111111111111111111111111111111111' },
        mode: 'onchain',
      },
      async () => ({ tx: '0xabc' }),
    );

    expect(output.mode).toBe('onchain');
    expect(output.onchainEntryId).toBe('entry-1');
    expect(ledger.log).toHaveBeenCalledOnce();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('throws when off-chain logging fails and failOpen is false', async () => {
    vi.mocked(globalThis.fetch).mockRejectedValue(new Error('network down'));

    const contracts = createMockContractFactory();
    const events = createEventEmitter();
    const telemetry = createTelemetry();
    const ledger = { log: vi.fn() } as unknown as import('../../src/modules/ledger/EventLedger.js').EventLedger;
    const audit = new AuditTrail(contracts, events, telemetry, ledger, {
      mode: 'offchain',
      failOpen: false,
    });

    await expect(audit.gate(
      {
        action: 'agent.swap',
        actor: { type: 'agent', address: '0x1111111111111111111111111111111111111111' },
      },
      async () => 'ok',
    )).rejects.toThrow(/Off-chain audit logging failed/);

    expect(ledger.log).not.toHaveBeenCalled();
  });
});
