/**
 * Unit tests for platform adapters.
 * Each adapter is tested with a mock Invariance client.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { Identity, SpecPolicy, LedgerEntry, EscrowContract } from '@invariance/common';
import type { ReputationScore, Badge } from '../../modules/reputation/types.js';
import type { Listing, HireResult } from '../../modules/marketplace/types.js';
import type { EvaluationResult } from '../../modules/policy/types.js';
import type { PublishAgentOptions } from '../MarketplacePlugin.js';

// ============================================================================
// Shared mock data
// ============================================================================

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
  depositor: { identityId: 'id-dep', address: '0xDep' },
  recipient: { identityId: 'id-rec', address: '0xRec' },
  amount: '5000',
  state: 'funded',
  conditions: { type: 'manual', timeout: 'P30D' },
  createdAt: 1000,
  txHash: '0xtx5',
  explorerUrl: 'https://basescan.org/tx/0xtx5',
};

const mockEvaluation: EvaluationResult = {
  allowed: true,
  policyId: 'pol-123',
  rules: [],
};

const mockAttestation = { txHash: '0xattest' };

const mockReputation: ReputationScore = {
  identityId: 'id-123',
  overall: 85,
  completionRate: 0.95,
  avgResponseTime: 1000,
  totalActions: 100,
  violations: 0,
  lastUpdated: 1000,
};

const mockBadge: Badge = {
  name: 'Verified',
  level: 'gold',
  score: 85,
  criteria: 'High completion rate',
};

function createMockClient() {
  return {
    identity: {
      register: vi.fn().mockResolvedValue(mockIdentity),
      get: vi.fn().mockResolvedValue(mockIdentity),
      attest: vi.fn().mockResolvedValue(mockAttestation),
    },
    policy: {
      create: vi.fn().mockResolvedValue(mockPolicy),
      attach: vi.fn().mockResolvedValue({ txHash: '0xattach' }),
      evaluate: vi.fn().mockResolvedValue(mockEvaluation),
    },
    escrow: {
      create: vi.fn().mockResolvedValue(mockEscrow),
    },
    ledger: {
      log: vi.fn().mockResolvedValue(mockLedgerEntry),
    },
    reputation: {
      get: vi.fn().mockResolvedValue(mockReputation),
      badge: vi.fn().mockResolvedValue(mockBadge),
    },
    marketplace: {
      register: vi.fn().mockResolvedValue({ listingId: 'list-123', identity: mockIdentity } as unknown as Listing),
      get: vi.fn().mockResolvedValue({ listingId: 'list-123', identity: mockIdentity } as unknown as Listing),
      hire: vi.fn().mockResolvedValue({ hireId: 'hire-123', escrowId: 'esc-123' } as unknown as HireResult),
    },
    createMultiSig: vi.fn().mockResolvedValue(mockEscrow),
    hireAndFund: vi.fn().mockResolvedValue({ hireId: 'hire-123', escrowId: 'esc-123' }),
  } as unknown as import('../../core/InvarianceClient.js').Invariance;
}

// ============================================================================
// RuntimeHookAdapter
// ============================================================================

describe('RuntimeHookAdapter', () => {
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    client = createMockClient();
  });

  it('beforeAction allows when no policy', async () => {
    const { RuntimeHookAdapter } = await import('../RuntimeHookAdapter.js');
    const adapter = new RuntimeHookAdapter(client);

    const result = await adapter.beforeAction({
      action: 'swap',
      actor: { type: 'agent', address: '0xAgent' },
      params: {},
    });

    expect(result.allowed).toBe(true);
  });

  it('beforeAction evaluates policy when provided', async () => {
    const { RuntimeHookAdapter } = await import('../RuntimeHookAdapter.js');
    const adapter = new RuntimeHookAdapter(client);

    const result = await adapter.beforeAction({
      action: 'swap',
      actor: { type: 'agent', address: '0xAgent' },
      params: {},
      policyId: 'pol-123',
    });

    expect(result.allowed).toBe(true);
    expect(client.policy.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ policyId: 'pol-123', action: 'swap' }),
    );
  });

  it('afterAction logs to ledger', async () => {
    const { RuntimeHookAdapter } = await import('../RuntimeHookAdapter.js');
    const adapter = new RuntimeHookAdapter(client);

    const result = await adapter.afterAction(
      { action: 'swap', actor: { type: 'agent', address: '0xAgent' }, params: {} },
      { success: true, txHash: '0xresult' },
    );

    expect(result.entryId).toBe('entry-123');
    expect(client.ledger.log).toHaveBeenCalled();
  });

  it('wrap executes function with before/after hooks', async () => {
    const { RuntimeHookAdapter } = await import('../RuntimeHookAdapter.js');
    const adapter = new RuntimeHookAdapter(client);
    const fn = vi.fn().mockResolvedValue({ txHash: '0xresult' });

    const { result, log } = await adapter.wrap(
      { action: 'swap', actor: { type: 'agent', address: '0xAgent' }, params: {} },
      fn,
    );

    expect(fn).toHaveBeenCalled();
    expect(result.txHash).toBe('0xresult');
    expect(log.entryId).toBe('entry-123');
  });

  it('wrap denies when policy fails', async () => {
    const { RuntimeHookAdapter } = await import('../RuntimeHookAdapter.js');
    (client.policy.evaluate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      allowed: false,
      reason: 'Exceeded spend limit',
    });

    const adapter = new RuntimeHookAdapter(client);

    await expect(
      adapter.wrap(
        { action: 'swap', actor: { type: 'agent', address: '0xAgent' }, params: {}, policyId: 'pol-123' },
        async () => 'result',
      ),
    ).rejects.toThrow('denied');
  });

  it('calls custom hooks', async () => {
    const { RuntimeHookAdapter } = await import('../RuntimeHookAdapter.js');
    const onBeforeEvaluate = vi.fn();
    const onAfterEvaluate = vi.fn();
    const adapter = new RuntimeHookAdapter(client, { onBeforeEvaluate, onAfterEvaluate });

    await adapter.beforeAction({
      action: 'swap',
      actor: { type: 'agent', address: '0xAgent' },
      params: {},
    });

    expect(onBeforeEvaluate).toHaveBeenCalled();
    expect(onAfterEvaluate).toHaveBeenCalled();
  });
});

// ============================================================================
// MultiAgentComposer
// ============================================================================

describe('MultiAgentComposer', () => {
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    client = createMockClient();
  });

  it('setupCrew registers members with role policies', async () => {
    const { MultiAgentComposer } = await import('../MultiAgentComposer.js');
    const composer = new MultiAgentComposer(client);

    const crew = await composer.setupCrew({
      name: 'test-crew',
      budget: '5000',
      roles: [
        { name: 'researcher', rules: [], allowedActions: ['query'] },
      ],
      members: [
        { identity: { type: 'agent', owner: '0xDev', label: 'R-1' }, role: 'researcher' },
      ],
      signers: ['0xSig1', '0xSig2'],
      threshold: 2,
    });

    expect(crew.members).toHaveLength(1);
    expect(crew.members[0].role).toBe('researcher');
    expect(crew.escrow).toBeDefined();
    expect(crew.sharedPolicy).toBeDefined();
    expect(client.identity.register).toHaveBeenCalled();
    expect(client.policy.create).toHaveBeenCalledTimes(2); // shared + role
    expect(client.policy.attach).toHaveBeenCalledTimes(2); // shared + role
  });

  it('rejects unknown roles', async () => {
    const { MultiAgentComposer } = await import('../MultiAgentComposer.js');
    const composer = new MultiAgentComposer(client);

    await expect(
      composer.setupCrew({
        name: 'test',
        budget: '1000',
        roles: [{ name: 'known', rules: [] }],
        members: [{ identity: { type: 'agent', owner: '0x', label: 'A' }, role: 'unknown' }],
        signers: ['0x1'],
        threshold: 1,
      }),
    ).rejects.toThrow('Unknown role');
  });
});

// ============================================================================
// MarketplacePlugin
// ============================================================================

describe('MarketplacePlugin', () => {
  it('publishAgent creates listing with badge', async () => {
    const client = createMockClient();
    const { MarketplacePlugin } = await import('../MarketplacePlugin.js');
    const plugin = new MarketplacePlugin(client);

    const publishOpts: PublishAgentOptions = {
      identity: 'id-123',
      name: 'TestBot',
      description: 'A test bot',
      category: 'data-analysis',
      pricing: { model: 'per-task', amount: '50' },
      generateBadge: true,
    };
    const result = await plugin.publishAgent(publishOpts);

    expect(result.listing).toBeDefined();
    expect(result.badge).toBeDefined();
    expect(client.marketplace.register).toHaveBeenCalled();
    expect(client.reputation.badge).toHaveBeenCalled();
  });

  it('hireWithEscrow delegates to hireAndFund', async () => {
    const client = createMockClient();
    const { MarketplacePlugin } = await import('../MarketplacePlugin.js');
    const plugin = new MarketplacePlugin(client);

    await plugin.hireWithEscrow({
      listingId: 'list-123',
      task: { description: 'Test task' },
      payment: { amount: '100', type: 'escrow' },
    });

    expect(client.hireAndFund).toHaveBeenCalled();
  });
});

// ============================================================================
// ReputationBridge
// ============================================================================

describe('ReputationBridge', () => {
  it('aggregates Invariance + external scores', async () => {
    const client = createMockClient();
    const { ReputationBridge } = await import('../ReputationBridge.js');
    const bridge = new ReputationBridge(client);

    bridge.importExternalScore('id-123', {
      platform: 'gitcoin',
      score: 90,
      fetchedAt: Date.now(),
    });

    const agg = await bridge.getAggregatedScore('id-123');

    expect(agg.invarianceScore).toBe(85);
    expect(agg.externalAverage).toBe(90);
    // 0.7 * 85 + 0.3 * 90 = 59.5 + 27 = 86.5
    expect(agg.score).toBe(86.5);
    expect(agg.sourceCount).toBe(2);
  });

  it('returns only Invariance score when no externals', async () => {
    const client = createMockClient();
    const { ReputationBridge } = await import('../ReputationBridge.js');
    const bridge = new ReputationBridge(client);

    const agg = await bridge.getAggregatedScore('id-123');
    expect(agg.score).toBe(85);
    expect(agg.sourceCount).toBe(1);
  });

  it('replaces duplicate platform scores', async () => {
    const client = createMockClient();
    const { ReputationBridge } = await import('../ReputationBridge.js');
    const bridge = new ReputationBridge(client);

    bridge.importExternalScore('id-123', { platform: 'gitcoin', score: 80, fetchedAt: 1 });
    bridge.importExternalScore('id-123', { platform: 'gitcoin', score: 95, fetchedAt: 2 });

    const scores = bridge.getExternalScores('id-123');
    expect(scores).toHaveLength(1);
    expect(scores[0].score).toBe(95);
  });
});

// ============================================================================
// CrossChainEscrow
// ============================================================================

describe('CrossChainEscrow', () => {
  it('creates escrow with bridge policy', async () => {
    const client = createMockClient();
    const { CrossChainEscrow } = await import('../CrossChainEscrow.js');
    const xEscrow = new CrossChainEscrow(client);

    const result = await xEscrow.create({
      sourceChain: 'base',
      destinationChain: 'optimism',
      amount: '5000',
      recipient: { type: 'agent', address: '0xAgent' },
      perChainCap: '2500',
    });

    expect(result.sourceChain).toBe('base');
    expect(result.destinationChain).toBe('optimism');
    expect(result.escrow).toBeDefined();
    expect(result.policy).toBeDefined();
    expect(client.policy.create).toHaveBeenCalled();
    expect(client.escrow.create).toHaveBeenCalled();
  });
});

// ============================================================================
// IdentityGatekeeper
// ============================================================================

describe('IdentityGatekeeper', () => {
  it('issues time-bounded credential', async () => {
    const client = createMockClient();
    const { IdentityGatekeeper } = await import('../IdentityGatekeeper.js');
    const gk = new IdentityGatekeeper(client);

    const cred = await gk.verifyAndGate({
      identityId: 'id-123',
      platform: 'world-id',
      validityMs: 1000 * 60 * 60, // 1 hour
    });

    expect(cred.identityId).toBe('id-123');
    expect(cred.platform).toBe('world-id');
    expect(cred.active).toBe(true);
    expect(cred.expiresAt).toBeGreaterThan(Date.now());
    expect(client.identity.attest).toHaveBeenCalled();
  });

  it('returns existing credential for sybil check', async () => {
    const client = createMockClient();
    const { IdentityGatekeeper } = await import('../IdentityGatekeeper.js');
    const gk = new IdentityGatekeeper(client);

    const cred1 = await gk.verifyAndGate({ identityId: 'id-123', platform: 'world-id' });
    const cred2 = await gk.verifyAndGate({ identityId: 'id-123', platform: 'world-id' });

    expect(cred1.txHash).toBe(cred2.txHash);
    expect(client.identity.attest).toHaveBeenCalledTimes(1); // Only once
  });

  it('isVerified returns correct status', async () => {
    const client = createMockClient();
    const { IdentityGatekeeper } = await import('../IdentityGatekeeper.js');
    const gk = new IdentityGatekeeper(client);

    expect(gk.isVerified('id-123', 'world-id')).toBe(false);
    await gk.verifyAndGate({ identityId: 'id-123', platform: 'world-id' });
    expect(gk.isVerified('id-123', 'world-id')).toBe(true);
  });

  it('revokeExpired cleans up stale credentials', async () => {
    const client = createMockClient();
    const { IdentityGatekeeper } = await import('../IdentityGatekeeper.js');
    const gk = new IdentityGatekeeper(client);

    await gk.verifyAndGate({ identityId: 'id-123', platform: 'test', validityMs: -1 }); // Already expired
    const revoked = gk.revokeExpired();
    expect(revoked).toBe(1);
    expect(gk.isVerified('id-123', 'test')).toBe(false);
  });

  it('accessLog records to ledger', async () => {
    const client = createMockClient();
    const { IdentityGatekeeper } = await import('../IdentityGatekeeper.js');
    const gk = new IdentityGatekeeper(client);

    const log = await gk.accessLog('0xService', 'id-123', 'email');
    expect(log.entryId).toBe('entry-123');
    expect(client.ledger.log).toHaveBeenCalled();
  });
});

// ============================================================================
// BCIIntentVerifier
// ============================================================================

describe('BCIIntentVerifier', () => {
  it('auto-approves high confidence signals', async () => {
    const client = createMockClient();
    const { BCIIntentVerifier } = await import('../BCIIntentVerifier.js');
    const bci = new BCIIntentVerifier(client);

    const result = await bci.verifyIntent({
      deviceId: 'id-123',
      humanId: 'id-123',
      confidence: 0.98,
      action: 'query',
      params: {},
    });

    expect(result.approved).toBe(true);
    expect(result.method).toBe('auto');
  });

  it('requires human review for medium confidence', async () => {
    const client = createMockClient();
    const { BCIIntentVerifier } = await import('../BCIIntentVerifier.js');
    const bci = new BCIIntentVerifier(client);

    const result = await bci.verifyIntent({
      deviceId: 'id-123',
      humanId: 'id-123',
      confidence: 0.8,
      action: 'transfer',
      params: {},
    });

    expect(result.approved).toBe(true);
    expect(result.method).toBe('human-review');
  });

  it('denies low confidence signals', async () => {
    const client = createMockClient();
    const { BCIIntentVerifier } = await import('../BCIIntentVerifier.js');
    const bci = new BCIIntentVerifier(client);

    const result = await bci.verifyIntent({
      deviceId: 'id-123',
      humanId: 'id-123',
      confidence: 0.1,
      action: 'transfer',
      params: {},
    });

    expect(result.approved).toBe(false);
    expect(result.method).toBe('denied');
  });

  it('forces human review for high-stakes actions', async () => {
    const client = createMockClient();
    const { BCIIntentVerifier } = await import('../BCIIntentVerifier.js');
    const bci = new BCIIntentVerifier(client);

    const result = await bci.verifyIntent({
      deviceId: 'id-123',
      humanId: 'id-123',
      confidence: 0.99,
      action: 'delete-account',
      params: {},
    });

    expect(result.method).toBe('human-review');
  });
});

// ============================================================================
// MEVComplianceKit
// ============================================================================

describe('MEVComplianceKit', () => {
  it('registers bot with beneficiary gates', async () => {
    const client = createMockClient();
    const { MEVComplianceKit } = await import('../MEVComplianceKit.js');
    const mev = new MEVComplianceKit(client);

    const bot = await mev.registerBot({
      identity: { type: 'agent', owner: '0xDev', label: 'ArbBot' },
      beneficiaries: ['0xTreasury'],
      maxDailyExtraction: '50000',
      allowedStrategies: ['arbitrage'],
    });

    expect(bot.identity.identityId).toBe('id-123');
    expect(bot.beneficiaries).toEqual(['0xTreasury']);
    expect(mev.isBeneficiaryApproved('id-123', '0xTreasury')).toBe(true);
    expect(mev.isBeneficiaryApproved('id-123', '0xOther')).toBe(false);
  });

  it('rejects extraction to unapproved beneficiary', async () => {
    const client = createMockClient();
    const { MEVComplianceKit } = await import('../MEVComplianceKit.js');
    const mev = new MEVComplianceKit(client);

    await mev.registerBot({
      identity: { type: 'agent', owner: '0xDev', label: 'Bot' },
      beneficiaries: ['0xTreasury'],
    });

    await expect(
      mev.logExtraction('id-123', { strategy: 'arb', amount: '100', beneficiary: '0xEvil' }),
    ).rejects.toThrow('not approved');
  });

  it('logs extraction to approved beneficiary', async () => {
    const client = createMockClient();
    const { MEVComplianceKit } = await import('../MEVComplianceKit.js');
    const mev = new MEVComplianceKit(client);

    await mev.registerBot({
      identity: { type: 'agent', owner: '0xDev', label: 'Bot' },
      beneficiaries: ['0xTreasury'],
    });

    const log = await mev.logExtraction('id-123', {
      strategy: 'arbitrage',
      amount: '500',
      beneficiary: '0xTreasury',
    });

    expect(log.entryId).toBe('entry-123');
    expect(log.beneficiary).toBe('0xTreasury');
  });
});

// ============================================================================
// GovernmentComplianceKit
// ============================================================================

describe('GovernmentComplianceKit', () => {
  it('sets up agency with role policies', async () => {
    const client = createMockClient();
    const { GovernmentComplianceKit } = await import('../GovernmentComplianceKit.js');
    const gov = new GovernmentComplianceKit(client);

    const agency = await gov.setupAgency({
      name: 'DOT',
      identity: { type: 'service', owner: '0xGov', label: 'DOT' },
      roles: [
        { name: 'officer', maxSpend: '100000', allowedActions: ['approve', 'procure'] },
        { name: 'vendor', maxSpend: '0', allowedActions: ['bid', 'deliver'] },
      ],
      agencyCap: '10000000',
    });

    expect(agency.identity).toBeDefined();
    expect(agency.rolePolicies.size).toBe(2);
    expect(agency.rolePolicies.has('officer')).toBe(true);
    expect(agency.rolePolicies.has('vendor')).toBe(true);
  });

  it('distributes benefits with cap enforcement', async () => {
    const client = createMockClient();
    const { GovernmentComplianceKit } = await import('../GovernmentComplianceKit.js');
    const gov = new GovernmentComplianceKit(client);

    const result = await gov.distributeBenefits({
      program: 'UBI',
      recipients: ['id-1', 'id-2', 'id-3'],
      amountPerRecipient: '800',
      maxTotal: '2000',
    });

    expect(result.successCount).toBe(2); // Only 2 fit within 2000
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].reason).toContain('Maximum');
  });

  it('creates milestone escrow', async () => {
    const client = createMockClient();
    const { GovernmentComplianceKit } = await import('../GovernmentComplianceKit.js');
    const gov = new GovernmentComplianceKit(client);

    const result = await gov.milestoneEscrow(
      'road-project',
      '1000000',
      [{ description: 'Phase 1', amount: '500000', verifier: 'id-auditor' }],
      ['0xSig1', '0xSig2'],
      2,
    );

    expect(result.escrow).toBeDefined();
    expect(result.milestones).toHaveLength(1);
    expect(client.ledger.log).toHaveBeenCalled();
  });
});

// ============================================================================
// SocialGraphAdapter
// ============================================================================

describe('SocialGraphAdapter', () => {
  it('links agents and builds trust graph', async () => {
    const client = createMockClient();
    const { SocialGraphAdapter } = await import('../SocialGraphAdapter.js');
    const graph = new SocialGraphAdapter(client);

    await graph.linkAgents('a', 'b', 'trusts', 0.9);
    await graph.linkAgents('b', 'c', 'trusts', 0.8);

    const trust = graph.getTrustGraph('a', 3);
    expect(trust.nodes).toHaveLength(3);
    expect(trust.origin).toBe('a');

    const nodeC = trust.nodes.find((n) => n.identityId === 'c');
    expect(nodeC).toBeDefined();
    expect(nodeC!.depth).toBe(2);
    expect(nodeC!.trustScore).toBeCloseTo(0.72, 2); // 0.9 * 0.8
  });

  it('rejects invalid strength', async () => {
    const client = createMockClient();
    const { SocialGraphAdapter } = await import('../SocialGraphAdapter.js');
    const graph = new SocialGraphAdapter(client);

    await expect(graph.linkAgents('a', 'b', 'trusts', 1.5)).rejects.toThrow('between 0.0 and 1.0');
  });

  it('finds mutual connections', async () => {
    const client = createMockClient();
    const { SocialGraphAdapter } = await import('../SocialGraphAdapter.js');
    const graph = new SocialGraphAdapter(client);

    await graph.linkAgents('a', 'c', 'trusts', 0.9);
    await graph.linkAgents('b', 'c', 'trusts', 0.8);

    const mutual = graph.getMutualConnections('a', 'b');
    expect(mutual).toEqual(['c']);
  });

  it('unlinks agents', async () => {
    const client = createMockClient();
    const { SocialGraphAdapter } = await import('../SocialGraphAdapter.js');
    const graph = new SocialGraphAdapter(client);

    await graph.linkAgents('a', 'b', 'trusts', 0.9);
    expect(graph.getLinks('a')).toHaveLength(1);

    const removed = graph.unlinkAgents('a', 'b', 'trusts');
    expect(removed).toBe(true);
    expect(graph.getLinks('a')).toHaveLength(0);
  });
});

// ============================================================================
// Policy Templates
// ============================================================================

describe('Policy Templates (new)', () => {
  it('all 7 new templates are registered', async () => {
    const { listTemplates, getTemplate } = await import('../../modules/policy/templates.js');
    const templates = listTemplates();
    const names = templates.map((t) => t.name);

    expect(names).toContain('mev-bot');
    expect(names).toContain('social-agent');
    expect(names).toContain('cross-chain-bridge');
    expect(names).toContain('payment-delegation');
    expect(names).toContain('iot-device');
    expect(names).toContain('government-benefits');
    expect(names).toContain('identity-verifier');

    // Verify each has rules
    for (const name of ['mev-bot', 'social-agent', 'cross-chain-bridge', 'payment-delegation', 'iot-device', 'government-benefits', 'identity-verifier']) {
      const tmpl = getTemplate(name);
      expect(tmpl).toBeDefined();
      expect(tmpl!.rules.length).toBeGreaterThan(0);
      expect(tmpl!.builtin).toBe(true);
    }
  });

  it('mev-bot has correct rules', async () => {
    const { getTemplate } = await import('../../modules/policy/templates.js');
    const tmpl = getTemplate('mev-bot')!;

    expect(tmpl.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'max-spend', config: { amount: '50000', period: '24h' } }),
        expect.objectContaining({ type: 'action-whitelist' }),
        expect.objectContaining({ type: 'rate-limit' }),
      ]),
    );
  });

  it('social-agent has zero spending', async () => {
    const { getTemplate } = await import('../../modules/policy/templates.js');
    const tmpl = getTemplate('social-agent')!;

    const spendRule = tmpl.rules.find((r) => r.type === 'max-spend');
    expect(spendRule!.config.amount).toBe('0');
  });
});
