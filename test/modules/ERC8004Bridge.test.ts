import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InvarianceBridge } from '../../src/modules/erc8004/InvarianceBridge.js';
import { InvarianceEventEmitter } from '../../src/core/EventEmitter.js';
import { Telemetry } from '../../src/core/Telemetry.js';
import type { ERC8004Manager } from '../../src/modules/erc8004/ERC8004Manager.js';
import type { IdentityManager } from '../../src/modules/identity/IdentityManager.js';
import type { EventLedger } from '../../src/modules/ledger/EventLedger.js';
import type { ContractFactory } from '../../src/core/ContractFactory.js';

function createMockERC8004Manager(): ERC8004Manager {
  return {
    setMetadata: vi.fn().mockResolvedValue({ txHash: '0xmeta', blockNumber: 100, status: 'success' }),
    getMetadata: vi.fn().mockResolvedValue(''),
    getGlobalId: vi.fn().mockReturnValue('eip155:84532:0xRegistry:42'),
    getSummary: vi.fn().mockResolvedValue({ count: 10, summaryValue: 350, decimals: 2 }),
    giveFeedback: vi.fn().mockResolvedValue({ txHash: '0xfeedback', blockNumber: 101, status: 'success' }),
    respondToValidation: vi.fn().mockResolvedValue({ txHash: '0xvalidation', blockNumber: 102, status: 'success' }),
    requestValidation: vi.fn().mockResolvedValue({ txHash: '0xrequest', blockNumber: 103, status: 'success' }),
  } as unknown as ERC8004Manager;
}

function createMockIdentityManager(): IdentityManager {
  return {
    attest: vi.fn().mockResolvedValue({
      attestationId: 'attest-1',
      txHash: '0xattest',
    }),
  } as unknown as IdentityManager;
}

function createMockEventLedger(): EventLedger {
  return {
    query: vi.fn().mockResolvedValue([
      { entryId: 'e1', action: 'swap', category: 'execution', timestamp: Date.now() },
      { entryId: 'e2', action: 'transfer', category: 'execution', timestamp: Date.now() },
      { entryId: 'e3', action: 'failed-action', category: 'error', timestamp: Date.now() },
    ]),
  } as unknown as EventLedger;
}

function createMockContractFactory(): ContractFactory {
  return {
    getWalletAddress: vi.fn().mockReturnValue('0xInvarianceWallet'),
    getPublicClient: vi.fn(),
    getWalletClient: vi.fn(),
    getChainId: vi.fn().mockReturnValue(84532),
  } as unknown as ContractFactory;
}

describe('InvarianceBridge', () => {
  let bridge: InvarianceBridge;
  let mockErc8004: ERC8004Manager;
  let mockIdentity: IdentityManager;
  let mockLedger: EventLedger;
  let mockContracts: ContractFactory;
  let events: InvarianceEventEmitter;
  let telemetry: Telemetry;

  beforeEach(() => {
    mockErc8004 = createMockERC8004Manager();
    mockIdentity = createMockIdentityManager();
    mockLedger = createMockEventLedger();
    mockContracts = createMockContractFactory();
    events = new InvarianceEventEmitter();
    telemetry = new Telemetry(true);

    bridge = new InvarianceBridge(
      mockErc8004,
      mockIdentity,
      mockLedger,
      mockContracts,
      events,
      telemetry,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // Identity Linking
  // ===========================================================================

  describe('linkIdentity()', () => {
    it('sets ERC-8004 metadata and creates Invariance attestation', async () => {
      const linked = await bridge.linkIdentity('inv-id-1', 42n);

      expect(mockErc8004.setMetadata).toHaveBeenCalledWith(
        42n,
        'invariance-identity-id',
        'inv-id-1',
      );

      expect(mockIdentity.attest).toHaveBeenCalledWith('inv-id-1', {
        claim: 'erc8004-agent-id',
        attester: '0xInvarianceWallet',
        evidence: '42',
      });

      expect(linked.invarianceIdentityId).toBe('inv-id-1');
      expect(linked.erc8004AgentId).toBe('42');
      expect(linked.erc8004GlobalId).toBe('eip155:84532:0xRegistry:42');
      expect(linked.txHash).toBe('0xmeta');
      expect(linked.linkedAt).toBeGreaterThan(0);
    });

    it('emits erc8004.identity.linked event', async () => {
      const listener = vi.fn();
      events.on('erc8004.identity.linked', listener);

      await bridge.linkIdentity('inv-id-1', 42n);

      expect(listener).toHaveBeenCalledOnce();
      expect(listener.mock.calls[0]![0]).toEqual({
        invarianceIdentityId: 'inv-id-1',
        erc8004AgentId: '42',
      });
    });
  });

  describe('getLinkedIdentity()', () => {
    it('returns null when no link exists', async () => {
      const result = await bridge.getLinkedIdentity('inv-id-unknown');
      expect(result).toBeNull();
    });

    it('returns cached link after linkIdentity()', async () => {
      await bridge.linkIdentity('inv-id-1', 42n);

      const result = await bridge.getLinkedIdentity('inv-id-1');
      expect(result).not.toBeNull();
      expect(result!.invarianceIdentityId).toBe('inv-id-1');
      expect(result!.erc8004AgentId).toBe('42');
    });
  });

  describe('unlinkIdentity()', () => {
    it('clears ERC-8004 metadata and removes from cache', async () => {
      await bridge.linkIdentity('inv-id-1', 42n);

      await bridge.unlinkIdentity('inv-id-1');

      // Verify metadata was cleared
      expect(mockErc8004.setMetadata).toHaveBeenLastCalledWith(
        42n,
        'invariance-identity-id',
        '',
      );

      // Verify cache is cleared
      const result = await bridge.getLinkedIdentity('inv-id-1');
      expect(result).toBeNull();
    });

    it('emits erc8004.identity.unlinked event', async () => {
      const listener = vi.fn();
      events.on('erc8004.identity.unlinked', listener);

      await bridge.linkIdentity('inv-id-1', 42n);
      await bridge.unlinkIdentity('inv-id-1');

      expect(listener).toHaveBeenCalledOnce();
      expect(listener.mock.calls[0]![0]).toEqual({
        invarianceIdentityId: 'inv-id-1',
        erc8004AgentId: '42',
      });
    });

    it('does nothing when no link exists', async () => {
      await bridge.unlinkIdentity('inv-id-unknown');
      // Should not throw
    });
  });

  // ===========================================================================
  // Reputation Bridging
  // ===========================================================================

  describe('pullERC8004Reputation()', () => {
    it('normalizes ERC-8004 summary to 0-100 score', async () => {
      const signal = await bridge.pullERC8004Reputation(42n);

      expect(signal.source).toBe('erc8004');
      expect(signal.feedbackCount).toBe(10);
      // summaryValue=350, decimals=2 => rawValue=3.50
      // normalizedScore = (3.50 / 5) * 100 = 70
      expect(signal.averageValue).toBe(3.5);
      expect(signal.normalizedScore).toBe(70);
    });

    it('handles zero decimals', async () => {
      (mockErc8004.getSummary as ReturnType<typeof vi.fn>).mockResolvedValue({
        count: 5,
        summaryValue: 4,
        decimals: 0,
      });

      const signal = await bridge.pullERC8004Reputation(42n);

      // rawValue=4, normalizedScore = (4/5) * 100 = 80
      expect(signal.averageValue).toBe(4);
      expect(signal.normalizedScore).toBe(80);
    });

    it('clamps normalized score to 0-100 range', async () => {
      (mockErc8004.getSummary as ReturnType<typeof vi.fn>).mockResolvedValue({
        count: 1,
        summaryValue: 1000,
        decimals: 0,
      });

      const signal = await bridge.pullERC8004Reputation(42n);
      expect(signal.normalizedScore).toBeLessThanOrEqual(100);
    });
  });

  describe('pushFeedbackFromLedger()', () => {
    it('derives feedback value from ledger entries', async () => {
      const receipt = await bridge.pushFeedbackFromLedger('inv-id-1', 42n, {
        tag1: 'invariance-audit',
      });

      // 3 entries, 1 error => 2/3 success rate => 0.667 * 5 = 3.33 => rounds to 3
      expect(mockErc8004.giveFeedback).toHaveBeenCalledWith({
        agentId: 42n,
        value: 3,
        tag1: 'invariance-audit',
        tag2: '',
        feedbackURI: '',
      });

      expect(receipt.txHash).toBe('0xfeedback');
    });

    it('emits erc8004.feedback.pushed event', async () => {
      const listener = vi.fn();
      events.on('erc8004.feedback.pushed', listener);

      await bridge.pushFeedbackFromLedger('inv-id-1', 42n, {
        tag1: 'invariance-audit',
      });

      expect(listener).toHaveBeenCalledOnce();
      expect(listener.mock.calls[0]![0]).toEqual({
        erc8004AgentId: '42',
        value: 3,
      });
    });

    it('passes lookbackMs as from timestamp to ledger query', async () => {
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);

      await bridge.pushFeedbackFromLedger('inv-id-1', 42n, {
        tag1: 'audit',
        lookbackMs: 86400000, // 24 hours
      });

      expect(mockLedger.query).toHaveBeenCalledWith({
        actor: 'inv-id-1',
        from: now - 86400000,
        limit: 1000,
      });
    });

    it('gives max feedback when all entries are successful', async () => {
      (mockLedger.query as ReturnType<typeof vi.fn>).mockResolvedValue([
        { entryId: 'e1', action: 'swap', category: 'execution', timestamp: Date.now() },
        { entryId: 'e2', action: 'transfer', category: 'execution', timestamp: Date.now() },
      ]);

      await bridge.pushFeedbackFromLedger('inv-id-1', 42n, { tag1: 'audit' });

      expect(mockErc8004.giveFeedback).toHaveBeenCalledWith(
        expect.objectContaining({ value: 5 }),
      );
    });
  });

  // ===========================================================================
  // Validation Bridging
  // ===========================================================================

  describe('actAsValidator()', () => {
    it('reads ledger and submits validation response', async () => {
      // Link identity first so bridge can look up the identity
      await bridge.linkIdentity('inv-id-1', 42n);

      const receipt = await bridge.actAsValidator(
        42n,
        '0xRequestHash' as `0x${string}`,
      );

      expect(mockLedger.query).toHaveBeenCalledWith({
        actor: 'inv-id-1',
        limit: 100,
      });

      // 3 entries, 1 error => 66% compliance => below 90%, response=0
      expect(mockErc8004.respondToValidation).toHaveBeenCalledWith({
        requestHash: '0xRequestHash',
        response: 0,
      });

      expect(receipt.txHash).toBe('0xvalidation');
    });

    it('responds with 1 (valid) when compliance >= 90%', async () => {
      (mockLedger.query as ReturnType<typeof vi.fn>).mockResolvedValue([
        { entryId: 'e1', action: 'swap', category: 'execution', timestamp: Date.now() },
        { entryId: 'e2', action: 'transfer', category: 'execution', timestamp: Date.now() },
        { entryId: 'e3', action: 'bridge', category: 'execution', timestamp: Date.now() },
      ]);

      await bridge.linkIdentity('inv-id-1', 42n);
      await bridge.actAsValidator(42n, '0xRequestHash' as `0x${string}`);

      expect(mockErc8004.respondToValidation).toHaveBeenCalledWith({
        requestHash: '0xRequestHash',
        response: 1,
      });
    });

    it('emits erc8004.validation.responded event', async () => {
      const listener = vi.fn();
      events.on('erc8004.validation.responded', listener);

      await bridge.actAsValidator(42n, '0xRequestHash' as `0x${string}`);

      expect(listener).toHaveBeenCalledOnce();
      expect(listener.mock.calls[0]![0]).toMatchObject({
        requestHash: '0xRequestHash',
      });
    });

    it('defaults to valid when no linked identity found', async () => {
      await bridge.actAsValidator(999n, '0xHash' as `0x${string}`);

      expect(mockErc8004.respondToValidation).toHaveBeenCalledWith({
        requestHash: '0xHash',
        response: 1,
      });
    });
  });

  describe('requestInvarianceValidation()', () => {
    it('submits validation request using wallet address', async () => {
      const receipt = await bridge.requestInvarianceValidation(
        42n,
        'https://validate.example.com',
      );

      expect(mockErc8004.requestValidation).toHaveBeenCalledWith({
        agentId: 42n,
        validator: '0xInvarianceWallet',
        requestURI: 'https://validate.example.com',
      });

      expect(receipt.txHash).toBe('0xrequest');
    });
  });

  // ===========================================================================
  // Telemetry
  // ===========================================================================

  describe('Telemetry', () => {
    it('tracks all bridge operations', async () => {
      const trackSpy = vi.spyOn(telemetry, 'track');

      await bridge.linkIdentity('inv-id-1', 42n);
      await bridge.getLinkedIdentity('inv-id-1');
      await bridge.unlinkIdentity('inv-id-1');
      await bridge.pullERC8004Reputation(42n);
      await bridge.pushFeedbackFromLedger('inv-id-1', 42n, { tag1: 'audit' });
      await bridge.actAsValidator(42n, '0xHash' as `0x${string}`);
      await bridge.requestInvarianceValidation(42n, 'https://validate.example.com');

      const trackedEvents = trackSpy.mock.calls.map((c) => c[0]);
      expect(trackedEvents).toContain('erc8004.linkIdentity');
      expect(trackedEvents).toContain('erc8004.getLinkedIdentity');
      expect(trackedEvents).toContain('erc8004.unlinkIdentity');
      expect(trackedEvents).toContain('erc8004.pullReputation');
      expect(trackedEvents).toContain('erc8004.pushFeedback');
      expect(trackedEvents).toContain('erc8004.actAsValidator');
      expect(trackedEvents).toContain('erc8004.requestValidation');
    });
  });
});
