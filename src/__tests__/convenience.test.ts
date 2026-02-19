/**
 * Unit tests for Invariance SDK convenience methods.
 *
 * Each method is tested by mocking the underlying module calls
 * and verifying the correct composition of operations.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { Identity, SpecPolicy, IntentResult, LedgerEntry, EscrowContract, HireResult, CompletionResult, ReputationScore, ExportData } from '@invariance/common';
import type { VerificationResult } from '../modules/verify/types.js';

// ============================================================================
// Create mock Invariance instance with spied module methods
// ============================================================================

function createMockInvariance() {
  const mockIdentity: Identity = {
    identityId: 'id-123',
    type: 'agent',
    address: '0xAgent',
    owner: '0xDev',
    label: 'TestBot',
    capabilities: [],
    status: 'active',
    attestations: 0,
    createdAt: 1000,
    txHash: '0xtx1',
    explorerUrl: 'https://basescan.org/tx/0xtx1',
  };

  const mockPolicy: SpecPolicy = {
    policyId: 'pol-123',
    name: 'test-policy',
    rules: [{ type: 'rate-limit', config: { max: 100, window: 'PT1H' } }],
    actor: 'agent',
    state: 'active',
    attachedTo: [],
    createdAt: 1000,
    txHash: '0xtx2',
  };

  const mockIntentResult: IntentResult = {
    intentId: 'int-123',
    status: 'completed',
    txHash: '0xtx3',
    proof: { proofHash: '0xproof', actorSig: '0xsig1', platformSig: '0xsig2', timestamp: 1000, blockNumber: 100, metadataHash: '0xmeta' },
    gasUsed: '21000',
    explorerUrl: 'https://basescan.org/tx/0xtx3',
  };

  const mockLedgerEntry: LedgerEntry = {
    entryId: 'entry-123',
    action: 'test-action',
    actor: { type: 'agent', address: '0xAgent' },
    category: 'custom',
    txHash: '0xtx4',
    blockNumber: 100,
    timestamp: 1000,
    proof: { proofHash: '0xproof', actorSig: '0xsig1', platformSig: '0xsig2', timestamp: 1000, blockNumber: 100, metadataHash: '0xmeta' },
    metadataHash: '0xmeta',
    explorerUrl: 'https://basescan.org/tx/0xtx4',
  };

  const mockEscrow: EscrowContract = {
    escrowId: 'esc-123',
    contractAddress: '0xEscrow',
    depositor: { type: 'human', address: '0xDev' },
    recipient: { type: 'agent', address: '0xAgent' },
    amount: '1000',
    state: 'created',
    conditions: { type: 'multi-sig', timeout: 'P30D', multiSig: { signers: ['0xS1', '0xS2'], threshold: 2 } },
    createdAt: 1000,
    txHash: '0xtx5',
    explorerUrl: 'https://basescan.org/tx/0xtx5',
  };

  const mockReputation: ReputationScore = {
    overall: 4.5,
    reliability: 4.5,
    speed: 4.0,
    volume: 3.5,
    consistency: 4.5,
    policyCompliance: 5.0,
    reviewAverage: 4.5,
    reviewCount: 10,
    tier: 'gold',
  };

  const mockHireResult: HireResult = {
    hireId: 'hire-123',
    escrowId: 'esc-456',
    policyId: 'pol-456',
    listing: {
      listingId: 'list-123',
      identity: mockIdentity,
      name: 'Test Listing',
      description: 'Test',
      category: 'analysis',
      pricing: { type: 'fixed', amount: '200', currency: 'USDC' },
      capabilities: ['analyze'],
      reputation: mockReputation,
      reviewSummary: { average: 4.5, count: 10, distribution: { 1: 0, 2: 0, 3: 1, 4: 3, 5: 6 } },
      active: true,
      createdAt: 1000,
      txHash: '0xtx6',
      explorerUrl: 'https://basescan.org/tx/0xtx6',
    },
    status: 'active',
    explorerUrl: 'https://basescan.org/tx/0xtx6',
  };

  const mockCompletion: CompletionResult = {
    hireId: 'hire-123',
    escrowReleased: true,
    reviewId: 'rev-123',
    updatedReputation: mockReputation,
    explorerUrl: 'https://basescan.org/tx/0xtx7',
  };

  const mockVerification: VerificationResult = {
    verified: true,
    txHash: '0xtx4',
    blockNumber: 100,
    timestamp: 1000,
    action: 'test-action',
    actor: { type: 'agent', address: '0xAgent' },
    proof: { proofHash: '0xproof', actorSig: '0xsig1', platformSig: '0xsig2', timestamp: 1000, blockNumber: 100, metadataHash: '0xmeta' },
    explorerUrl: 'https://basescan.org/tx/0xtx4',
  };

  const mockExport: ExportData = {
    format: 'json',
    data: '[]',
    count: 0,
    generatedAt: 1000,
  };

  // Build the mock using a plain object that mimics Invariance
  const inv = {
    resolveOffchainActor: vi.fn((actor) => actor ?? { type: 'human', address: '0xWallet' }),
    wallet: {
      getAddress: vi.fn().mockReturnValue('0xWallet'),
    },
    identity: {
      register: vi.fn().mockResolvedValue(mockIdentity),
      get: vi.fn().mockResolvedValue(mockIdentity),
    },
    policy: {
      create: vi.fn().mockResolvedValue(mockPolicy),
      attach: vi.fn().mockResolvedValue({ txHash: '0xtxAttach' }),
    },
    intent: {
      request: vi.fn().mockResolvedValue(mockIntentResult),
    },
    ledger: {
      log: vi.fn().mockResolvedValue(mockLedgerEntry),
      query: vi.fn().mockResolvedValue([mockLedgerEntry]),
      export: vi.fn().mockResolvedValue(mockExport),
    },
    ledgerOffchain: {
      log: vi.fn().mockResolvedValue({
        entryId: 'off-123',
        action: 'agent.swap',
        actor: { type: 'agent', address: '0xAgent' },
        category: 'custom',
        severity: 'info',
        metadata: {},
        timestamp: 1000,
        createdAt: new Date(1000).toISOString(),
      }),
    },
    auditTrail: {
      log: vi.fn().mockResolvedValue({
        id: 'audit-123',
        action: 'agent.swap',
        actor: { type: 'agent', address: '0xAgent' },
        status: 'success',
        createdAt: new Date(1000).toISOString(),
      }),
      query: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    },
    escrow: {
      create: vi.fn().mockResolvedValue(mockEscrow),
      fund: vi.fn().mockResolvedValue({ txHash: '0xtxFund' }),
    },
    marketplace: {
      hire: vi.fn().mockResolvedValue(mockHireResult),
      complete: vi.fn().mockResolvedValue(mockCompletion),
    },
    reputation: {
      review: vi.fn().mockResolvedValue({ reviewId: 'rev-123' }),
    },
    verify: vi.fn().mockResolvedValue(mockVerification),
    // Convenience methods that are called by other convenience methods
    hireAndFund: vi.fn().mockResolvedValue(mockHireResult),
    quickSetup: vi.fn().mockResolvedValue({ identity: mockIdentity, policy: mockPolicy }),
  };

  // Import the actual convenience methods and bind them
  // We test by calling the methods with `inv` as `this`
  return { inv, mockIdentity, mockPolicy, mockIntentResult, mockLedgerEntry, mockEscrow, mockHireResult, mockCompletion, mockVerification, mockExport, mockReputation };
}

// Dynamically import the class to get the prototype methods
// We'll call them with our mock as `this`
async function getConvenienceMethods() {
  const mod = await import('../core/InvarianceClient.js');
  return mod.Invariance.prototype;
}

describe('Convenience Methods', () => {
  let proto: Awaited<ReturnType<typeof getConvenienceMethods>>;

  beforeEach(async () => {
    proto = await getConvenienceMethods();
  });

  describe('quickSetup', () => {
    it('registers identity, creates policy, and attaches them', async () => {
      const { inv, mockIdentity, mockPolicy } = createMockInvariance();
      const result = await proto.quickSetup.call(inv, {
        identity: { type: 'agent', owner: '0xDev', label: 'Bot' },
        policy: { name: 'limits', rules: [{ type: 'max-spend', config: { amount: '1000' } }] },
      });

      expect(inv.identity.register).toHaveBeenCalledOnce();
      expect(inv.policy.create).toHaveBeenCalledOnce();
      expect(inv.policy.attach).toHaveBeenCalledWith(mockPolicy.policyId, mockIdentity.identityId);
      expect(result.identity).toBe(mockIdentity);
      expect(result.policy).toBe(mockPolicy);
    });
  });

  describe('hireAndFund', () => {
    it('hires from listing and funds the escrow', async () => {
      const { inv, mockHireResult } = createMockInvariance();
      const result = await proto.hireAndFund.call(inv, {
        listingId: 'list-123',
        task: { description: 'Do work', deadline: '2025-06-01' },
        payment: { amount: '200', type: 'escrow' as const },
      });

      expect(inv.marketplace.hire).toHaveBeenCalledOnce();
      expect(inv.escrow.fund).toHaveBeenCalledWith(mockHireResult.escrowId);
      expect(result).toBe(mockHireResult);
    });

    it('funds escrow even when custom fundAmount is provided', async () => {
      const { inv, mockHireResult } = createMockInvariance();
      await proto.hireAndFund.call(inv, {
        listingId: 'list-123',
        task: { description: 'Do work', deadline: '2025-06-01' },
        payment: { amount: '200', type: 'escrow' as const },
        fundAmount: '500',
      });

      expect(inv.escrow.fund).toHaveBeenCalledWith(mockHireResult.escrowId);
    });
  });

  describe('batchRegister', () => {
    it('registers multiple agents with shared policy', async () => {
      const { inv } = createMockInvariance();
      const results = await proto.batchRegister.call(inv, {
        agents: [
          { identity: { type: 'agent', owner: '0xDev', label: 'W1' } },
          { identity: { type: 'agent', owner: '0xDev', label: 'W2' } },
        ],
        sharedPolicy: { name: 'shared', rules: [{ type: 'rate-limit', config: { max: 10, window: 'PT1H' } }] },
      });

      expect(results).toHaveLength(2);
      expect(inv.identity.register).toHaveBeenCalledTimes(2);
      // 1 shared policy created (no overrides)
      expect(inv.policy.create).toHaveBeenCalledTimes(1);
      expect(inv.policy.attach).toHaveBeenCalledTimes(2);
    });

    it('uses per-agent policy override when provided', async () => {
      const { inv } = createMockInvariance();
      await proto.batchRegister.call(inv, {
        agents: [
          { identity: { type: 'agent', owner: '0xDev', label: 'W1' }, policyOverride: { name: 'custom', rules: [] } },
        ],
        sharedPolicy: { name: 'shared', rules: [] },
      });

      // shared + override = 2 policy creates
      expect(inv.policy.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('executeAndLog', () => {
    it('executes intent and logs ledger event', async () => {
      const { inv, mockIntentResult, mockLedgerEntry } = createMockInvariance();
      const result = await proto.executeAndLog.call(inv, {
        intent: {
          actor: { type: 'agent', address: '0xAgent' },
          action: 'moderate',
          params: { contentId: 'post-1' },
          approval: 'auto',
        },
        log: {
          action: 'moderated',
          actor: { type: 'agent', address: '0xAgent' },
          category: 'custom',
        },
      });

      expect(inv.intent.request).toHaveBeenCalledOnce();
      expect(inv.ledger.log).toHaveBeenCalledOnce();
      expect(result.intent).toBe(mockIntentResult);
      expect(result.log).toBe(mockLedgerEntry);
    });
  });

  describe('recurringPayment', () => {
    it('creates policy with require-payment and time-window rules', async () => {
      const { inv } = createMockInvariance();
      await proto.recurringPayment.call(inv, {
        name: 'monthly-sub',
        amount: '50',
        recipient: '0xService',
        interval: 'P1M',
        maxPayments: 12,
      });

      expect(inv.policy.create).toHaveBeenCalledOnce();
      const createCall = inv.policy.create.mock.calls[0][0];
      expect(createCall.name).toBe('monthly-sub');
      expect(createCall.rules).toHaveLength(2);
      expect(createCall.rules[0].type).toBe('require-payment');
      expect(createCall.rules[1].type).toBe('time-window');
    });

    it('adds action-whitelist when allowedActions provided', async () => {
      const { inv } = createMockInvariance();
      await proto.recurringPayment.call(inv, {
        name: 'sub',
        amount: '50',
        recipient: '0xService',
        interval: 'P1M',
        allowedActions: ['subscribe', 'renew'],
      });

      const createCall = inv.policy.create.mock.calls[0][0];
      expect(createCall.rules).toHaveLength(3);
      expect(createCall.rules[2].type).toBe('action-whitelist');
    });
  });

  describe('createMultiSig', () => {
    it('creates escrow with multi-sig conditions', async () => {
      const { inv, mockEscrow } = createMockInvariance();
      const result = await proto.createMultiSig.call(inv, {
        amount: '10000',
        recipient: { type: 'agent', address: '0xAgent' },
        signers: ['0xS1', '0xS2', '0xS3'],
        threshold: 2,
      });

      expect(inv.escrow.create).toHaveBeenCalledOnce();
      const createCall = inv.escrow.create.mock.calls[0][0];
      expect(createCall.conditions.type).toBe('multi-sig');
      expect(createCall.conditions.multiSig.signers).toEqual(['0xS1', '0xS2', '0xS3']);
      expect(createCall.conditions.multiSig.threshold).toBe(2);
      expect(createCall.conditions.timeout).toBe('P30D');
      expect(result).toBe(mockEscrow);
    });

    it('uses custom timeout when provided', async () => {
      const { inv } = createMockInvariance();
      await proto.createMultiSig.call(inv, {
        amount: '5000',
        recipient: { type: 'agent', address: '0xAgent' },
        signers: ['0xS1'],
        threshold: 1,
        timeout: 'P7D',
      });

      const createCall = inv.escrow.create.mock.calls[0][0];
      expect(createCall.conditions.timeout).toBe('P7D');
    });
  });

  describe('setupRateLimitedAgent', () => {
    it('calls quickSetup with rate-limit policy', async () => {
      const { inv } = createMockInvariance();
      await proto.setupRateLimitedAgent.call(inv, {
        identity: { type: 'agent', owner: '0xDev', label: 'SupportBot' },
        maxActions: 100,
        window: 'PT1H',
      });

      expect(inv.quickSetup).toHaveBeenCalledOnce();
      const setupCall = inv.quickSetup.mock.calls[0][0];
      expect(setupCall.policy.rules[0].type).toBe('rate-limit');
      expect(setupCall.policy.rules[0].config).toEqual({ max: 100, window: 'PT1H' });
    });

    it('adds cooldown, whitelist, and max-spend when provided', async () => {
      const { inv } = createMockInvariance();
      await proto.setupRateLimitedAgent.call(inv, {
        identity: { type: 'agent', owner: '0xDev', label: 'Bot' },
        maxActions: 50,
        window: 'PT1H',
        cooldown: 'PT5S',
        allowedActions: ['reply', 'escalate'],
        maxSpend: '100',
      });

      const setupCall = inv.quickSetup.mock.calls[0][0];
      expect(setupCall.policy.rules).toHaveLength(4);
      const ruleTypes = setupCall.policy.rules.map((r: { type: string }) => r.type);
      expect(ruleTypes).toContain('rate-limit');
      expect(ruleTypes).toContain('cooldown');
      expect(ruleTypes).toContain('action-whitelist');
      expect(ruleTypes).toContain('max-spend');
    });
  });

  describe('hireAndReview', () => {
    it('hires, funds, completes, and reviews in one flow', async () => {
      const { inv, mockHireResult, mockCompletion } = createMockInvariance();
      const result = await proto.hireAndReview.call(inv, {
        hire: {
          listingId: 'list-123',
          task: { description: 'Work', deadline: '2025-06-01' },
          payment: { amount: '200', type: 'escrow' as const },
        },
        review: { rating: 5, comment: 'Great' },
      });

      expect(inv.hireAndFund).toHaveBeenCalledOnce();
      expect(inv.marketplace.complete).toHaveBeenCalledOnce();
      expect(result.hire).toBe(mockHireResult);
      expect(result.completion).toBe(mockCompletion);
      expect(result.review.reviewId).toBe('rev-123');
    });
  });

  describe('audit', () => {
    it('queries ledger entries without verification', async () => {
      const { inv } = createMockInvariance();
      const report = await proto.audit.call(inv, { actor: '0xAgent' });

      expect(inv.ledger.query).toHaveBeenCalledOnce();
      expect(report.totalEntries).toBe(1);
      expect(report.verifiedCount).toBe(0);
      expect(report.failedVerifications).toHaveLength(0);
    });

    it('verifies entries when verify=true', async () => {
      const { inv } = createMockInvariance();
      const report = await proto.audit.call(inv, { actor: '0xAgent', verify: true });

      expect(inv.verify).toHaveBeenCalledOnce();
      expect(report.verifiedCount).toBe(1);
    });

    it('records failed verifications', async () => {
      const { inv } = createMockInvariance();
      inv.verify.mockRejectedValueOnce(new Error('bad proof'));
      const report = await proto.audit.call(inv, { verify: true });

      expect(report.verifiedCount).toBe(0);
      expect(report.failedVerifications).toHaveLength(1);
      expect(report.failedVerifications[0].error).toBe('bad proof');
    });

    it('exports when exportFormat provided', async () => {
      const { inv, mockExport } = createMockInvariance();
      const report = await proto.audit.call(inv, { exportFormat: 'json' });

      expect(inv.ledger.export).toHaveBeenCalledOnce();
      expect(report.exported).toBe(mockExport);
    });
  });

  describe('delegate', () => {
    it('creates scoped policy and records delegation intent', async () => {
      const { inv, mockPolicy, mockIntentResult } = createMockInvariance();
      const result = await proto.delegate.call(inv, {
        from: 'id-orchestrator',
        to: 'id-worker',
        scope: {
          actions: ['fetch-data', 'transform'],
          maxSpend: '50',
          expiry: '2025-06-01T00:00:00Z',
        },
      });

      expect(inv.policy.create).toHaveBeenCalledOnce();
      const createCall = inv.policy.create.mock.calls[0][0];
      expect(createCall.name).toBe('delegation-id-orchestrator-to-id-worker');
      expect(createCall.rules[0].type).toBe('action-whitelist');
      expect(createCall.rules[1].type).toBe('max-spend');
      expect(createCall.expiry).toBe('2025-06-01T00:00:00Z');

      expect(inv.policy.attach).toHaveBeenCalledWith(mockPolicy.policyId, 'id-worker');
      expect(inv.identity.get).toHaveBeenCalledWith('id-orchestrator');
      expect(inv.intent.request).toHaveBeenCalledOnce();
      expect(result.policy).toBe(mockPolicy);
      expect(result.intent).toBe(mockIntentResult);
    });
  });

  describe('off-chain logging', () => {
    it('logs to audit store by default', async () => {
      const { inv } = createMockInvariance();
      const result = await proto.logOffchain.call(inv, 'agent.swap', {
        actor: { type: 'agent', address: '0xAgent' },
        metadata: { amount: '100' },
      });

      expect(inv.auditTrail.log).toHaveBeenCalledOnce();
      expect(inv.ledgerOffchain.log).not.toHaveBeenCalled();
      expect(result.mode).toBe('audit');
      expect(result.audit?.id).toBe('audit-123');
    });

    it('can dual-write to audit and off-chain ledger', async () => {
      const { inv } = createMockInvariance();
      const result = await proto.logOffchain.call(inv, {
        action: 'agent.swap',
        actor: { type: 'agent', address: '0xAgent' },
        mode: 'both',
        status: 'failure',
        error: { message: 'reverted' },
      });

      expect(inv.auditTrail.log).toHaveBeenCalledOnce();
      expect(inv.ledgerOffchain.log).toHaveBeenCalledOnce();
      expect(result.audit?.id).toBe('audit-123');
      expect(result.ledger?.entryId).toBe('off-123');
    });

    it('queries off-chain logs via audit trail', async () => {
      const { inv } = createMockInvariance();
      inv.auditTrail.query.mockResolvedValueOnce({ data: [{ id: 'a1' }], total: 1 });
      const result = await proto.queryOffchainLogs.call(inv, { actor: '0xAgent', action: 'agent.swap' });

      expect(inv.auditTrail.query).toHaveBeenCalledOnce();
      expect(result.total).toBe(1);
    });
  });
});
