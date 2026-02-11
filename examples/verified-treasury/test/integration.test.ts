/**
 * Integration test for the complete verified-treasury workflow
 *
 * Tests the end-to-end flow of initializing SDK, registering an agent,
 * creating a policy, executing verified trades, and querying audit trails.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { Invariance } from '@invariance/sdk';

// Mock the logger
vi.mock('../src/utils/logger.js', () => ({
  log: {
    banner: vi.fn(),
    step: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    data: vi.fn(),
    divider: vi.fn(),
  },
}));

// Import after mocking
const { initSDK } = await import('../src/steps/01-init.js');
const { registerAgent } = await import('../src/steps/02-register.js');
const { createPolicy } = await import('../src/steps/03-policy.js');
const { executeTrade } = await import('../src/steps/04-execute.js');
const { queryAuditTrail } = await import('../src/steps/07-audit.js');
const { verifyTransaction } = await import('../src/steps/08-verify.js');

describe('Verified Treasury - Full Workflow Integration', () => {
  const originalEnv = process.env;

  beforeAll(() => {
    process.env = { ...originalEnv };
    process.env.PRIVATE_KEY = '0x' + 'a'.repeat(64);
    process.env.RPC_URL = 'https://sepolia.base.org';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should execute the complete workflow successfully', async () => {
    // Step 1: Initialize SDK
    const { inv, account } = await initSDK();
    expect(inv).toBeInstanceOf(Invariance);
    expect(account.address).toMatch(/^0x[a-fA-F0-9]{40}$/);

    // Create mocked SDK methods for the rest of the workflow
    const mockIdentity = {
      identityId: 'id-test-123',
      address: '0xAgentTest',
      owner: account.address,
      label: 'TradingBot',
      capabilities: ['swap', 'rebalance'],
      status: 'active' as const,
      txHash: '0xtx1',
      explorerUrl: 'https://sepolia.basescan.org/tx/0xtx1',
      attestations: [],
      createdAt: Date.now(),
      type: 'agent' as const,
      metadata: {},
    };

    const mockPolicy = {
      policyId: 'pol-test-123',
      name: 'Treasury Policy',
      rules: [],
      status: 'active' as const,
      createdAt: Date.now(),
      actor: { type: 'agent' as const, address: '0xAgentTest' },
      metadata: {},
    };

    const mockIntentResult = {
      intentId: 'intent-test-123',
      status: 'executed' as const,
      action: 'swap',
      txHash: '0xtx2',
      blockNumber: 12345,
      explorerUrl: 'https://sepolia.basescan.org/tx/0xtx2',
      proof: {
        proofHash: '0xproofhash',
        verifiable: true,
        signatures: {
          actor: '0xactorsig',
          platform: '0xplatformsig',
        },
        merkleProof: [],
        timestamp: Date.now(),
      },
      actor: { type: 'agent' as const, address: '0xAgentTest' },
      params: {},
      amount: '100',
      createdAt: Date.now(),
    };

    const mockLedgerEvents = [
      {
        eventId: 'evt-1',
        action: 'register-identity',
        actor: { type: 'human' as const, address: account.address },
        category: 'identity' as const,
        timestamp: Date.now() - 3000,
        txHash: '0xtx1',
        metadata: {},
      },
      {
        eventId: 'evt-2',
        action: 'swap',
        actor: { type: 'agent' as const, address: '0xAgentTest' },
        category: 'intent' as const,
        timestamp: Date.now() - 1000,
        txHash: '0xtx2',
        metadata: {},
      },
    ];

    const mockVerification = {
      verified: true,
      actor: { type: 'agent' as const, address: '0xAgentTest', identityId: 'id-test-123' },
      action: 'swap',
      timestamp: Date.now(),
      txHash: '0xtx2',
      policyCompliant: true,
      identityVerified: true,
      escrowVerified: null,
      proofBundle: {
        proofHash: '0xproofhash',
        verifiable: true,
        signatures: { actor: '0xsig' },
        merkleProof: [],
        timestamp: Date.now(),
      },
      blockNumber: 12345,
    };

    // Mock the SDK methods
    vi.spyOn(inv.identity, 'register').mockResolvedValue(mockIdentity);
    vi.spyOn(inv.policy, 'create').mockResolvedValue(mockPolicy);
    vi.spyOn(inv.intent, 'prepare').mockResolvedValue({
      wouldSucceed: true,
      policyChecks: [
        { passed: true, rule: 'spending-cap', detail: 'Within daily limit' },
        { passed: true, rule: 'action-whitelist', detail: 'swap is allowed' },
      ],
      warnings: [],
      estimatedGas: { usdcCost: '0.25', ethCost: '0.0001', wei: '100000' },
    });
    vi.spyOn(inv.intent, 'request').mockResolvedValue(mockIntentResult);
    vi.spyOn(inv.ledger, 'query').mockResolvedValue(mockLedgerEvents);
    vi.spyOn(inv, 'verify').mockResolvedValue(mockVerification);

    // Step 2: Register agent
    const identity = await registerAgent(inv, account.address);
    expect(identity.identityId).toBe('id-test-123');
    expect(identity.label).toBe('TradingBot');

    // Step 3: Create policy
    const policy = await createPolicy(inv, identity);
    expect(policy.policyId).toBe('pol-test-123');

    // Step 4: Execute trade
    const intentResult = await executeTrade(inv, identity);
    expect(intentResult.intentId).toBe('intent-test-123');
    expect(intentResult.status).toBe('executed');
    expect(intentResult.proof.verifiable).toBe(true);

    // Step 7: Query audit trail
    await expect(queryAuditTrail(inv, identity)).resolves.not.toThrow();

    // Step 8: Verify transaction
    await expect(verifyTransaction(inv, intentResult)).resolves.not.toThrow();
  });

  it('should handle errors gracefully in the workflow', async () => {
    const { inv, account } = await initSDK();

    // Mock a failing identity registration
    vi.spyOn(inv.identity, 'register').mockRejectedValue(
      new Error('Identity registration failed on-chain')
    );

    await expect(registerAgent(inv, account.address)).rejects.toThrow(
      'Identity registration failed on-chain'
    );
  });

  it('should validate intent before execution', async () => {
    const { inv, account } = await initSDK();

    const mockIdentity = {
      identityId: 'id-test-456',
      address: '0xAgentTest2',
      owner: account.address,
      label: 'TradingBot',
      capabilities: ['swap'],
      status: 'active' as const,
      txHash: '0xtx',
      explorerUrl: 'https://explorer.test',
      attestations: [],
      createdAt: Date.now(),
      type: 'agent' as const,
      metadata: {},
    };

    vi.spyOn(inv.identity, 'register').mockResolvedValue(mockIdentity);

    // Mock prepare showing the intent would fail
    vi.spyOn(inv.intent, 'prepare').mockResolvedValue({
      wouldSucceed: false,
      policyChecks: [
        { passed: false, rule: 'spending-cap', detail: 'Exceeds daily limit' },
      ],
      warnings: ['Transaction will fail policy checks'],
      estimatedGas: { usdcCost: '0.25', ethCost: '0.0001', wei: '100000' },
    });

    vi.spyOn(inv.intent, 'request').mockRejectedValue(
      new Error('Policy violation: spending cap exceeded')
    );

    const identity = await registerAgent(inv, account.address);

    await expect(executeTrade(inv, identity)).rejects.toThrow(
      'Policy violation: spending cap exceeded'
    );
  });

  it('should maintain audit trail throughout workflow', async () => {
    const { inv, account } = await initSDK();

    const events: any[] = [];

    vi.spyOn(inv.identity, 'register').mockImplementation(async () => {
      events.push({ action: 'register-identity', timestamp: Date.now() });
      return {
        identityId: 'id-test-789',
        address: '0xAgent',
        owner: account.address,
        label: 'TradingBot',
        capabilities: ['swap'],
        status: 'active' as const,
        txHash: '0xtx',
        explorerUrl: 'https://explorer.test',
        attestations: [],
        createdAt: Date.now(),
        type: 'agent' as const,
        metadata: {},
      };
    });

    vi.spyOn(inv.policy, 'create').mockImplementation(async () => {
      events.push({ action: 'create-policy', timestamp: Date.now() });
      return {
        policyId: 'pol-test',
        name: 'Policy',
        rules: [],
        status: 'active' as const,
        createdAt: Date.now(),
        actor: { type: 'agent' as const, address: '0xAgent' },
        metadata: {},
      };
    });

    vi.spyOn(inv.intent, 'prepare').mockResolvedValue({
      wouldSucceed: true,
      policyChecks: [],
      warnings: [],
      estimatedGas: { usdcCost: '0.25', ethCost: '0.0001', wei: '100000' },
    });

    vi.spyOn(inv.intent, 'request').mockImplementation(async () => {
      events.push({ action: 'execute-intent', timestamp: Date.now() });
      return {
        intentId: 'intent-test',
        status: 'executed' as const,
        action: 'swap',
        txHash: '0xtx',
        blockNumber: 123,
        explorerUrl: 'https://explorer.test',
        proof: {
          proofHash: '0xproof',
          verifiable: true,
          signatures: { actor: '0xsig' },
          merkleProof: [],
          timestamp: Date.now(),
        },
        actor: { type: 'agent' as const, address: '0xAgent' },
        params: {},
        amount: '100',
        createdAt: Date.now(),
      };
    });

    vi.spyOn(inv.ledger, 'query').mockImplementation(async () => {
      return events.map((e, i) => ({
        eventId: `evt-${i}`,
        action: e.action,
        actor: { type: 'agent' as const, address: '0xAgent' },
        category: 'intent' as const,
        timestamp: e.timestamp,
        txHash: '0xtx',
        metadata: {},
      }));
    });

    const identity = await registerAgent(inv, account.address);
    await createPolicy(inv, identity);
    await executeTrade(inv, identity);

    const auditEvents = await inv.ledger.query({});
    expect(auditEvents.length).toBe(3);
    expect(auditEvents[0].action).toBe('register-identity');
    expect(auditEvents[1].action).toBe('create-policy');
    expect(auditEvents[2].action).toBe('execute-intent');
  });
});
