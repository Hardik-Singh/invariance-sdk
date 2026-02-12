import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IdentityManager } from '../../src/modules/identity/IdentityManager.js';
import { PolicyEngine } from '../../src/modules/policy/PolicyEngine.js';
import { EscrowManager } from '../../src/modules/escrow/EscrowManager.js';
import { IntentProtocol } from '../../src/modules/intent/IntentProtocol.js';
import { EventLedger } from '../../src/modules/ledger/EventLedger.js';
import { ReputationEngine } from '../../src/modules/reputation/ReputationEngine.js';
import { Verifier } from '../../src/modules/verify/Verifier.js';
import { GasManager } from '../../src/modules/gas/GasManager.js';
import {
  createMockContractFactory,
  createMockContract,
  createMockPublicClient,
  createEventEmitter,
  createTelemetry,
  createMockIntentRequestedLog,
  createMockEntryLoggedLog,
  createMockReviewSubmittedLog,
} from '../fixtures/mocks.js';
import type { InvarianceEventEmitter } from '../../src/core/EventEmitter.js';
import type { Telemetry } from '../../src/core/Telemetry.js';
import type { ContractFactory } from '../../src/core/ContractFactory.js';
import type { OnChainIdentity } from '../../src/modules/identity/types.js';
import type { OnChainPolicy, OnChainPolicyRule } from '../../src/modules/policy/types.js';
import type { OnChainEscrow } from '../../src/modules/escrow/types.js';
import { toBytes32 } from '../../src/utils/contract-helpers.js';

/**
 * Full E2E Integration Tests
 *
 * These tests verify the complete Invariance SDK flow across all 6 wired modules:
 * IdentityManager, PolicyEngine, IntentProtocol, EventLedger, Verifier, ReputationEngine
 */
describe('Full E2E Integration', () => {
  // Shared constants
  const AGENT_WALLET = '0x1111111111111111111111111111111111111111' as `0x${string}`;
  const OWNER_WALLET = '0x2222222222222222222222222222222222222222' as `0x${string}`;
  const BENEFICIARY_WALLET = '0x3333333333333333333333333333333333333333' as `0x${string}`;
  const IDENTITY_ID = toBytes32('agent-identity');
  const POLICY_ID = toBytes32('trade-policy');
  const INTENT_ID = toBytes32('intent-swap-1');
  const ENTRY_ID = toBytes32('ledger-entry-1');
  const ESCROW_ID = toBytes32('escrow-1');
  const REVIEW_ID = toBytes32('review-1');

  // Shared state
  let factory: ContractFactory;
  let events: InvarianceEventEmitter;
  let telemetry: Telemetry;
  let mockPublicClient: ReturnType<typeof createMockPublicClient>;

  // Mock contracts
  let mockIdentityContract: ReturnType<typeof createMockContract>;
  let mockPolicyContract: ReturnType<typeof createMockContract>;
  let mockIntentContract: ReturnType<typeof createMockContract>;
  let mockLedgerContract: ReturnType<typeof createMockContract>;
  let mockEscrowContract: ReturnType<typeof createMockContract>;
  let mockReviewContract: ReturnType<typeof createMockContract>;
  let mockUsdcContract: ReturnType<typeof createMockContract>;

  // On-chain mock data
  const mockIdentity: OnChainIdentity = {
    identityId: IDENTITY_ID,
    actorType: 0, // agent
    addr: AGENT_WALLET,
    owner: OWNER_WALLET,
    label: 'AlphaTrader',
    capabilities: ['swap', 'transfer'],
    status: 0, // active
    createdAt: 1700000000n,
    updatedAt: 1700000000n,
  };

  const mockPolicy: OnChainPolicy = {
    policyId: POLICY_ID,
    name: 'Trading Limits',
    creator: OWNER_WALLET,
    applicableActorTypes: [0], // agent
    state: 0, // active
    createdAt: 1700000000n,
    expiresAt: 0n,
  };

  const mockRules: OnChainPolicyRule[] = [
    { ruleType: 0, config: '0x00000000000000000000000000000000000000000000000000000000000186a0' as `0x${string}` },
    { ruleType: 4, config: '0x' as `0x${string}` },
  ];

  const mockEscrow: OnChainEscrow = {
    escrowId: ESCROW_ID,
    depositorIdentityId: IDENTITY_ID,
    beneficiaryIdentityId: toBytes32('beneficiary-id'),
    depositor: AGENT_WALLET,
    beneficiary: BENEFICIARY_WALLET,
    amount: 500000000n, // 500 USDC
    fundedAmount: 500000000n,
    conditionType: 0, // task-completion
    conditionData: '0x' as `0x${string}`,
    state: 2, // active
    createdAt: 1700000000n,
    expiresAt: 1700172800n,
    releasedAt: 0n,
  };

  beforeEach(() => {
    events = createEventEmitter();
    telemetry = createTelemetry();

    // --- Identity contract ---
    mockIdentityContract = createMockContract({
      read: {
        resolve: vi.fn().mockResolvedValue(IDENTITY_ID),
        get: vi.fn().mockResolvedValue(mockIdentity),
        isActive: vi.fn().mockResolvedValue(true),
        getAttestations: vi.fn().mockResolvedValue([]),
      },
      write: {
        register: vi.fn().mockResolvedValue('0xtx_identity' as `0x${string}`),
      },
    });

    // --- Policy contract ---
    mockPolicyContract = createMockContract({
      read: {
        getPolicy: vi.fn().mockResolvedValue(mockPolicy),
        getRules: vi.fn().mockResolvedValue(mockRules),
        evaluate: vi.fn().mockResolvedValue([true, 0, '0x']),
      },
      write: {
        create: vi.fn().mockResolvedValue('0xtx_policy' as `0x${string}`),
        attach: vi.fn().mockResolvedValue('0xtx_attach' as `0x${string}`),
      },
    });

    // --- Intent contract ---
    mockIntentContract = createMockContract({
      read: {
        verify: vi.fn().mockResolvedValue([
          {
            intentId: INTENT_ID,
            requesterIdentityId: IDENTITY_ID,
            requester: AGENT_WALLET,
            action: toBytes32('swap'),
            target: '0x0000000000000000000000000000000000000000',
            value: 0n,
            data: '0x',
            description: 'swap',
            metadataHash: toBytes32(''),
            status: 3, // completed
            createdAt: 1700000000n,
            expiresAt: 0n,
            completedAt: 1700001000n,
            resultHash: toBytes32('result'),
          },
          [],
        ]),
      },
      write: {
        request: vi.fn().mockResolvedValue('0xtx_intent' as `0x${string}`),
        approve: vi.fn().mockResolvedValue('0xtx_approve' as `0x${string}`),
        reject: vi.fn().mockResolvedValue('0xtx_reject' as `0x${string}`),
      },
    });

    // --- Ledger contract ---
    mockLedgerContract = createMockContract({
      read: {
        getEntry: vi.fn().mockResolvedValue({
          entryId: ENTRY_ID,
          actorIdentityId: IDENTITY_ID,
          actorType: 0,
          actorAddress: AGENT_WALLET,
          action: 'swap',
          category: 'custom',
          metadataHash: toBytes32('meta'),
          proofHash: toBytes32('proof'),
          actorSignature: '0xactorsig1234567890',
          platformSignature: '0xplatformsig1234567890',
          severity: 0,
          blockNumber: 200n,
          timestamp: 1700001000n,
        }),
        getEntryByProof: vi.fn(),
      },
      write: {
        log: vi.fn().mockResolvedValue('0xtx_ledger' as `0x${string}`),
        logBatch: vi.fn().mockResolvedValue('0xtx_batch' as `0x${string}`),
      },
    });

    // --- Escrow contract ---
    mockEscrowContract = createMockContract({
      read: {
        getEscrow: vi.fn().mockResolvedValue(mockEscrow),
      },
      write: {
        create: vi.fn().mockResolvedValue('0xtx_escrow' as `0x${string}`),
        fund: vi.fn().mockResolvedValue('0xtx_fund' as `0x${string}`),
        release: vi.fn().mockResolvedValue('0xtx_release' as `0x${string}`),
      },
    });

    // --- Review contract ---
    mockReviewContract = createMockContract({
      read: {
        getStats: vi.fn().mockResolvedValue({
          totalReviews: 5n,
          totalRating: 23n,
          totalQuality: 20n,
          totalCommunication: 22n,
          totalSpeed: 21n,
          totalValue: 23n,
        }),
      },
      write: {
        submit: vi.fn().mockResolvedValue('0xtx_review' as `0x${string}`),
      },
    });

    // --- USDC contract ---
    mockUsdcContract = createMockContract({
      read: {
        balanceOf: vi.fn().mockResolvedValue(1000000000n), // 1000 USDC
      },
      write: {
        approve: vi.fn().mockResolvedValue('0xtx_usdc' as `0x${string}`),
      },
    });

    // --- PublicClient ---
    mockPublicClient = createMockPublicClient();

    // Default receipt for intent request
    mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
      transactionHash: '0xtx_intent' as `0x${string}`,
      blockNumber: 100n,
      gasUsed: 21000n,
      status: 'success' as const,
      logs: [createMockIntentRequestedLog(INTENT_ID)],
    });

    // --- Factory ---
    factory = createMockContractFactory({
      contract: mockIdentityContract,
      publicClient: mockPublicClient,
    });

    vi.spyOn(factory, 'getContract').mockImplementation((name: string) => {
      if (name === 'identity') return mockIdentityContract as ReturnType<ContractFactory['getContract']>;
      if (name === 'policy') return mockPolicyContract as ReturnType<ContractFactory['getContract']>;
      if (name === 'intent') return mockIntentContract as ReturnType<ContractFactory['getContract']>;
      if (name === 'ledger') return mockLedgerContract as ReturnType<ContractFactory['getContract']>;
      if (name === 'escrow') return mockEscrowContract as ReturnType<ContractFactory['getContract']>;
      if (name === 'review') return mockReviewContract as ReturnType<ContractFactory['getContract']>;
      if (name === 'mockUsdc') return mockUsdcContract as ReturnType<ContractFactory['getContract']>;
      return mockIdentityContract as ReturnType<ContractFactory['getContract']>;
    });

    vi.spyOn(factory, 'getWalletAddress').mockReturnValue(AGENT_WALLET);
    vi.spyOn(factory, 'getGasStrategy').mockReturnValue('standard');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('Complete Verified Action Flow', () => {
    it('init → register identity → create policy → attach → evaluate → request intent → log to ledger → verify tx', async () => {
      // Stub fetch (indexer unavailable — tests should work without it)
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('indexer offline')));

      // Track all events
      const eventLog: string[] = [];
      events.on('identity.registered', () => eventLog.push('identity.registered'));
      events.on('policy.created', () => eventLog.push('policy.created'));
      events.on('intent.requested', () => eventLog.push('intent.requested'));
      events.on('ledger.logged', () => eventLog.push('ledger.logged'));

      // Initialize modules
      const identity = new IdentityManager(factory, events, telemetry);
      const policy = new PolicyEngine(factory, events, telemetry);
      const intent = new IntentProtocol(factory, events, telemetry);
      const ledger = new EventLedger(factory, events, telemetry);
      const verifier = new Verifier(factory, events, telemetry);

      // === Step 1: Register Identity ===
      const agent = await identity.register({
        type: 'agent',
        owner: OWNER_WALLET,
        label: 'AlphaTrader',
        capabilities: ['swap', 'transfer'],
      });
      expect(agent.identityId).toBeTruthy();
      expect(agent.type).toBe('agent');
      expect(agent.label).toBe('AlphaTrader');
      expect(mockIdentityContract.write.register).toHaveBeenCalledOnce();

      // === Step 2: Create Policy ===
      const tradingPolicy = await policy.create({
        name: 'Trading Limits',
        actor: 'agent',
        rules: [
          { type: 'max-spend', config: { limit: '100000' } },
          { type: 'action-whitelist', config: { actions: ['swap', 'transfer'] } },
        ],
      });
      expect(tradingPolicy.policyId).toBeTruthy();
      expect(tradingPolicy.rules).toHaveLength(2);
      expect(mockPolicyContract.write.create).toHaveBeenCalledOnce();

      // === Step 3: Attach Policy to Identity ===
      await policy.attach(tradingPolicy.policyId, agent.identityId);
      expect(mockPolicyContract.write.attach).toHaveBeenCalledOnce();

      // === Step 4: Evaluate Action (dry-run) ===
      const evaluation = await policy.evaluate({
        policyId: tradingPolicy.policyId,
        actor: { type: 'agent', address: AGENT_WALLET, identityId: agent.identityId },
        action: 'swap',
        params: { from: 'USDC', to: 'ETH', amount: '50000' },
      });
      expect(evaluation.allowed).toBe(true);

      // === Step 5: Request Intent ===
      const intentResult = await intent.request({
        actor: { type: 'agent', address: AGENT_WALLET },
        action: 'swap',
        params: { from: 'USDC', to: 'ETH', amount: '50000' },
        approval: 'auto',
      });
      expect(intentResult.action).toBe('swap');
      expect(intentResult.status).toBe('completed');
      expect(intentResult.proof).toBeDefined();
      expect(intentResult.proof.verifiable).toBe(true);
      expect(intentResult.explorerUrl).toContain('/tx/');
      expect(mockIntentContract.write.request).toHaveBeenCalledOnce();
      expect(mockIntentContract.write.approve).toHaveBeenCalledOnce();

      // === Step 6: Log to Ledger ===
      // Update receipt to return ledger event
      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        transactionHash: '0xtx_ledger' as `0x${string}`,
        blockNumber: 200n,
        gasUsed: 50000n,
        status: 'success' as const,
        logs: [createMockEntryLoggedLog(ENTRY_ID)],
      });

      const entry = await ledger.log({
        action: 'swap',
        actor: { type: 'agent', address: AGENT_WALLET },
        metadata: { from: 'USDC', to: 'ETH', amount: '50000', intentId: intentResult.intentId },
      });
      expect(entry.action).toBe('swap');
      expect(entry.proof.signatures.actor).toBeTruthy();
      expect(entry.proof.signatures.platform).toBeTruthy();
      expect(entry.proof.signatures.valid).toBe(true);
      expect(entry.explorerUrl).toContain('/tx/');
      expect(mockLedgerContract.write.log).toHaveBeenCalledOnce();

      // === Step 7: Verify Transaction ===
      // Update receipt for verifier
      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        transactionHash: '0xtx_ledger' as `0x${string}`,
        blockNumber: 200n,
        gasUsed: 50000n,
        status: 'success' as const,
        logs: [createMockEntryLoggedLog(ENTRY_ID)],
      });

      const verification = await verifier.verify('0xtx_ledger');
      expect(verification.verified).toBe(true);
      expect(verification.txHash).toBe('0xtx_ledger');
      expect(verification.action).toBe('swap');
      expect(verification.actor.type).toBe('agent');
      expect(verification.actor.address).toBe(AGENT_WALLET);
      expect(verification.proof.signatures.valid).toBe(true);
      expect(verification.explorerUrl).toContain('/tx/');

      // === Verify Event Ordering ===
      expect(eventLog).toContain('identity.registered');
      expect(eventLog).toContain('policy.created');
      expect(eventLog).toContain('intent.requested');
      expect(eventLog).toContain('ledger.logged');
      // Events should have been emitted in order
      expect(eventLog.indexOf('identity.registered')).toBeLessThan(eventLog.indexOf('policy.created'));
      expect(eventLog.indexOf('policy.created')).toBeLessThan(eventLog.indexOf('intent.requested'));
      expect(eventLog.indexOf('intent.requested')).toBeLessThan(eventLog.indexOf('ledger.logged'));
    });
  });

  describe('Blocked Action Flow', () => {
    it('identity → policy → intent denied by policy → violation event emitted', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('indexer offline')));

      // Track violation events
      const violations: unknown[] = [];
      events.on('policy.violation', (data) => violations.push(data));

      const identity = new IdentityManager(factory, events, telemetry);
      const policy = new PolicyEngine(factory, events, telemetry);

      // Step 1: Register identity
      const agent = await identity.register({
        type: 'agent',
        owner: OWNER_WALLET,
        label: 'RestrictedBot',
      });
      expect(agent.identityId).toBeTruthy();

      // Step 2: Create restrictive policy
      const restrictivePolicy = await policy.create({
        name: 'Restrictive Policy',
        actor: 'agent',
        rules: [
          { type: 'action-whitelist', config: { actions: ['transfer'] } },
        ],
      });

      // Step 3: Attach policy
      await policy.attach(restrictivePolicy.policyId, agent.identityId);

      // Step 4: Evaluate forbidden action — policy denies
      mockPolicyContract.read.evaluate.mockResolvedValue([false, 1, '0x']);

      const evaluation = await policy.evaluate({
        policyId: restrictivePolicy.policyId,
        actor: { type: 'agent', address: AGENT_WALLET, identityId: agent.identityId },
        action: 'swap', // Not in whitelist
        params: {},
      });

      expect(evaluation.allowed).toBe(false);
    });
  });

  describe('Escrow + Reputation Flow', () => {
    it('create escrow → fund → release → submit review → check reputation', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('indexer offline')));

      // Track events
      const eventLog: string[] = [];
      events.on('escrow.created', () => eventLog.push('escrow.created'));
      events.on('escrow.funded', () => eventLog.push('escrow.funded'));
      events.on('escrow.released', () => eventLog.push('escrow.released'));
      events.on('reputation.reviewed', () => eventLog.push('reputation.reviewed'));

      const escrow = new EscrowManager(factory, events, telemetry);
      const reputation = new ReputationEngine(factory, events, telemetry);

      // === Step 1: Create Escrow ===
      const escrowResult = await escrow.create({
        depositor: { type: 'agent', address: AGENT_WALLET },
        recipient: { type: 'agent', address: BENEFICIARY_WALLET },
        amount: '500.00',
        conditions: { type: 'task-completion', timeout: '48h' },
      });
      expect(escrowResult.escrowId).toBeTruthy();
      expect(mockEscrowContract.write.create).toHaveBeenCalledOnce();

      // === Step 2: Fund Escrow ===
      await escrow.fund(escrowResult.escrowId);
      expect(mockUsdcContract.write.approve).toHaveBeenCalled();
      expect(mockEscrowContract.write.fund).toHaveBeenCalled();

      // === Step 3: Release Escrow ===
      await escrow.release(escrowResult.escrowId);
      expect(mockEscrowContract.write.release).toHaveBeenCalled();

      // === Step 4: Submit Review ===
      // Set up receipt for review submission
      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        transactionHash: '0xtx_review' as `0x${string}`,
        blockNumber: 300n,
        gasUsed: 80000n,
        status: 'success' as const,
        logs: [createMockReviewSubmittedLog(REVIEW_ID)],
      });

      const reviewResult = await reputation.review({
        target: BENEFICIARY_WALLET,
        escrowId: escrowResult.escrowId,
        rating: 5,
        comment: 'Excellent service, task completed on time.',
      });
      expect(reviewResult.rating).toBe(5);
      expect(reviewResult.verified).toBe(true);
      expect(reviewResult.explorerUrl).toContain('/tx/');
      expect(mockReviewContract.write.submit).toHaveBeenCalledOnce();

      // === Step 5: Check Reputation Score ===
      const score = await reputation.score(BENEFICIARY_WALLET);
      expect(score.reviewAverage).toBeGreaterThan(0);
      expect(score.reviewCount).toBe(5);
      expect(score.tier).toBeDefined();
      expect(score.overall).toBeGreaterThan(0);

      // Verify event ordering
      expect(eventLog).toContain('escrow.created');
      expect(eventLog).toContain('escrow.funded');
      expect(eventLog).toContain('escrow.released');
      expect(eventLog).toContain('reputation.reviewed');
    });
  });

  describe('Gas Estimation Across Actions', () => {
    it('estimates gas for identity registration, policy creation, and intent request', async () => {
      const gas = new GasManager(factory, events, telemetry);

      const registerEstimate = await gas.estimate({ action: 'register' });
      expect(Number(registerEstimate.gasLimit)).toBeGreaterThan(0);
      expect(registerEstimate.strategy).toBe('standard');

      const policyEstimate = await gas.estimate({ action: 'policy' });
      expect(Number(policyEstimate.gasLimit)).toBeGreaterThan(0);

      const intentEstimate = await gas.estimate({ action: 'intent' });
      expect(Number(intentEstimate.gasLimit)).toBeGreaterThan(0);

      const balance = await gas.balance();
      expect(balance.ethBalance).toBeTruthy();
    });
  });

  describe('Verification Deep Dive', () => {
    it('verifier.identity() returns full audit of a registered identity', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('indexer offline')));

      const verifier = new Verifier(factory, events, telemetry);

      const audit = await verifier.identity(AGENT_WALLET);

      expect(audit.identity.label).toBe('AlphaTrader');
      expect(audit.identity.type).toBe('agent');
      expect(audit.identity.capabilities).toContain('swap');
      expect(audit.identity.capabilities).toContain('transfer');
      expect(audit.explorerUrl).toContain('/identity/');
    });

    it('verifier.escrow() returns full escrow audit trail', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('indexer offline')));

      const verifier = new Verifier(factory, events, telemetry);

      const audit = await verifier.escrow('escrow-1');

      expect(audit.escrowId).toBe('escrow-1');
      expect(audit.amount).toBe('500.000000');
      expect(audit.depositor.address).toBe(AGENT_WALLET);
      expect(audit.recipient.address).toBe(BENEFICIARY_WALLET);
      expect(audit.timeline.length).toBeGreaterThan(0);
    });

    it('verifier.bulk() handles mixed success/failure transactions', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('indexer offline')));

      const verifier = new Verifier(factory, events, telemetry);

      // First tx succeeds with ledger entry
      mockPublicClient.waitForTransactionReceipt
        .mockResolvedValueOnce({
          transactionHash: '0xsuccess' as `0x${string}`,
          blockNumber: 100n,
          gasUsed: 21000n,
          status: 'success' as const,
          logs: [createMockEntryLoggedLog(ENTRY_ID)],
        })
        // Second tx reverted
        .mockResolvedValueOnce({
          transactionHash: '0xfail' as `0x${string}`,
          blockNumber: 100n,
          gasUsed: 21000n,
          status: 'reverted' as const,
          logs: [],
        });

      const results = await verifier.bulk(['0xsuccess', '0xfail']);

      expect(results).toHaveLength(2);
      expect(results[0]!.verified).toBe(true);
      expect(results[1]!.verified).toBe(false);
    });
  });

  describe('Cross-Module Event Consistency', () => {
    it('all modules emit events that are received by shared EventEmitter', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('indexer offline')));

      // Use a dynamic mock that returns appropriate receipts based on the tx hash
      mockPublicClient.waitForTransactionReceipt.mockImplementation(({ hash }: { hash: string }) => {
        if (hash === '0xtx_intent') {
          return Promise.resolve({
            transactionHash: '0xtx_intent' as `0x${string}`,
            blockNumber: 103n,
            gasUsed: 21000n,
            status: 'success' as const,
            logs: [createMockIntentRequestedLog(INTENT_ID)],
          });
        }
        if (hash === '0xtx_ledger') {
          return Promise.resolve({
            transactionHash: '0xtx_ledger' as `0x${string}`,
            blockNumber: 105n,
            gasUsed: 50000n,
            status: 'success' as const,
            logs: [createMockEntryLoggedLog(ENTRY_ID)],
          });
        }
        // Default receipt for identity/policy/attach/approve
        return Promise.resolve({
          transactionHash: hash as `0x${string}`,
          blockNumber: 100n,
          gasUsed: 21000n,
          status: 'success' as const,
          logs: [],
        });
      });

      const allEvents: Array<{ name: string; data: unknown }> = [];
      const trackEvent = (name: string) => (data: unknown) => allEvents.push({ name, data });

      events.on('identity.registered', trackEvent('identity.registered'));
      events.on('policy.created', trackEvent('policy.created'));
      events.on('intent.requested', trackEvent('intent.requested'));
      events.on('intent.completed', trackEvent('intent.completed'));
      events.on('ledger.logged', trackEvent('ledger.logged'));

      const identityMgr = new IdentityManager(factory, events, telemetry);
      const policyMgr = new PolicyEngine(factory, events, telemetry);
      const intentMgr = new IntentProtocol(factory, events, telemetry);
      const ledgerMgr = new EventLedger(factory, events, telemetry);

      // Execute flow
      await identityMgr.register({ type: 'agent', owner: OWNER_WALLET, label: 'Test' });
      await policyMgr.create({ name: 'Test', actor: 'agent', rules: [{ type: 'max-spend', config: { limit: '1000' } }] });
      await policyMgr.attach(POLICY_ID, IDENTITY_ID);
      await intentMgr.request({
        actor: { type: 'agent', address: AGENT_WALLET },
        action: 'swap',
        params: {},
        approval: 'auto',
      });
      await ledgerMgr.log({
        action: 'swap',
        actor: { type: 'agent', address: AGENT_WALLET },
      });

      // Verify all events were emitted
      const eventNames = allEvents.map((e) => e.name);
      expect(eventNames).toContain('identity.registered');
      expect(eventNames).toContain('policy.created');
      expect(eventNames).toContain('intent.requested');
      expect(eventNames).toContain('ledger.logged');

      // Verify event data is well-formed
      const identityEvent = allEvents.find((e) => e.name === 'identity.registered');
      expect(identityEvent).toBeDefined();

      const intentEvent = allEvents.find((e) => e.name === 'intent.requested');
      expect(intentEvent).toBeDefined();
      expect((intentEvent!.data as { action: string }).action).toBe('swap');

      const ledgerEvent = allEvents.find((e) => e.name === 'ledger.logged');
      expect(ledgerEvent).toBeDefined();
      expect((ledgerEvent!.data as { action: string }).action).toBe('swap');
    });
  });

  describe('Telemetry Across Full Flow', () => {
    it('tracks telemetry events for every module method called', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('indexer offline')));

      const trackSpy = vi.spyOn(telemetry, 'track');

      const identityMgr = new IdentityManager(factory, events, telemetry);
      const policyMgr = new PolicyEngine(factory, events, telemetry);
      const gas = new GasManager(factory, events, telemetry);

      // Perform a few operations
      await identityMgr.register({ type: 'agent', owner: OWNER_WALLET, label: 'Test' });
      await policyMgr.create({ name: 'Test', actor: 'agent', rules: [{ type: 'max-spend', config: { limit: '1000' } }] });
      await gas.estimate({ action: 'register' });

      // Verify telemetry was tracked
      expect(trackSpy).toHaveBeenCalledWith('identity.register', expect.anything());
      expect(trackSpy).toHaveBeenCalledWith('policy.create', expect.anything());
      expect(trackSpy).toHaveBeenCalledWith('gas.estimate', expect.anything());
    });
  });
});
