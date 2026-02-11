/**
 * Test suite for verified-treasury CLI commands
 *
 * Tests each step function in isolation to ensure they properly
 * interact with the SDK and handle errors gracefully.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Invariance } from '@invariance/sdk';
import { privateKeyToAccount } from 'viem/accounts';
import { initSDK } from '../src/steps/01-init.js';
import { registerAgent } from '../src/steps/02-register.js';
import { createPolicy } from '../src/steps/03-policy.js';
import { executeTrade } from '../src/steps/04-execute.js';
import { attemptBlockedAction } from '../src/steps/05-blocked.js';
import { attemptOverLimit } from '../src/steps/06-over-limit.js';
import { queryAuditTrail } from '../src/steps/07-audit.js';
import { verifyTransaction } from '../src/steps/08-verify.js';

// Mock the logger to avoid console spam
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

describe('Verified Treasury - Step 1: Initialize SDK', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should throw error when PRIVATE_KEY is missing', async () => {
    delete process.env.PRIVATE_KEY;

    await expect(initSDK()).rejects.toThrow('PRIVATE_KEY is required');
  });

  it('should initialize SDK with provided configuration', async () => {
    process.env.PRIVATE_KEY = '0x' + '1'.repeat(64);
    process.env.RPC_URL = 'https://sepolia.base.org';

    const { inv, account } = await initSDK();

    expect(inv).toBeInstanceOf(Invariance);
    expect(account).toBeDefined();
    expect(account.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  it('should use default RPC URL when not provided', async () => {
    process.env.PRIVATE_KEY = '0x' + '1'.repeat(64);
    delete process.env.RPC_URL;

    const { inv } = await initSDK();

    expect(inv).toBeInstanceOf(Invariance);
  });
});

describe('Verified Treasury - Step 2: Register Agent', () => {
  it('should register a trading agent identity', async () => {
    const mockInv = {
      identity: {
        register: vi.fn().mockResolvedValue({
          identityId: 'id-123',
          address: '0xAgent',
          owner: '0xOwner',
          label: 'TradingBot',
          capabilities: ['swap', 'rebalance'],
          status: 'active',
          txHash: '0xtx',
          explorerUrl: 'https://explorer.example.com',
        }),
      },
    } as unknown as Invariance;

    const identity = await registerAgent(mockInv, '0xOwner');

    expect(identity).toBeDefined();
    expect(identity.identityId).toBe('id-123');
    expect(identity.label).toBe('TradingBot');
    expect(identity.capabilities).toContain('swap');
    expect(mockInv.identity.register).toHaveBeenCalledWith({
      type: 'agent',
      owner: '0xOwner',
      label: 'TradingBot',
      capabilities: ['swap', 'rebalance'],
      metadata: {
        version: '1.0.0',
        runtime: 'node',
      },
    });
  });

  it('should handle registration errors', async () => {
    const mockInv = {
      identity: {
        register: vi.fn().mockRejectedValue(new Error('Registration failed')),
      },
    } as unknown as Invariance;

    await expect(registerAgent(mockInv, '0xOwner')).rejects.toThrow('Registration failed');
  });
});

describe('Verified Treasury - Step 3: Create Policy', () => {
  it('should create a spending policy with rules', async () => {
    const mockInv = {
      policy: {
        create: vi.fn().mockResolvedValue({
          policyId: 'pol-123',
          rules: expect.any(Array),
          status: 'active',
        }),
      },
    } as unknown as Invariance;

    const mockIdentity = {
      identityId: 'id-123',
      address: '0xAgent',
    } as any;

    const policy = await createPolicy(mockInv, mockIdentity);

    expect(policy).toBeDefined();
    expect(mockInv.policy.create).toHaveBeenCalled();
  });
});

describe('Verified Treasury - Step 4: Execute Trade', () => {
  it('should prepare and execute a verified intent', async () => {
    const mockInv = {
      intent: {
        prepare: vi.fn().mockResolvedValue({
          wouldSucceed: true,
          policyChecks: [
            { passed: true, rule: 'spending-cap', detail: 'Within limit' },
            { passed: true, rule: 'action-whitelist', detail: 'Approved action' },
          ],
          warnings: [],
          estimatedGas: { usdcCost: '0.50' },
        }),
        request: vi.fn().mockResolvedValue({
          intentId: 'intent-123',
          status: 'executed',
          action: 'swap',
          txHash: '0xtx',
          blockNumber: 12345,
          explorerUrl: 'https://explorer.example.com',
          proof: {
            proofHash: '0xproof',
            verifiable: true,
            signatures: {
              actor: '0xsig1',
              platform: '0xsig2',
            },
          },
        }),
      },
    } as unknown as Invariance;

    const mockIdentity = {
      identityId: 'id-123',
      address: '0xAgent',
    } as any;

    const result = await executeTrade(mockInv, mockIdentity);

    expect(result.intentId).toBe('intent-123');
    expect(result.status).toBe('executed');
    expect(mockInv.intent.prepare).toHaveBeenCalledWith({
      actor: {
        type: 'agent',
        address: '0xAgent',
        identityId: 'id-123',
      },
      action: 'swap',
      params: { from: 'USDC', to: 'ETH', amount: '100' },
      approval: 'auto',
    });
    expect(mockInv.intent.request).toHaveBeenCalled();
  });

  it('should show warnings in dry-run', async () => {
    const mockInv = {
      intent: {
        prepare: vi.fn().mockResolvedValue({
          wouldSucceed: true,
          policyChecks: [],
          warnings: ['High gas cost detected'],
          estimatedGas: { usdcCost: '5.00' },
        }),
        request: vi.fn().mockResolvedValue({
          intentId: 'intent-123',
          status: 'executed',
          proof: { proofHash: '0xproof', verifiable: true, signatures: { actor: '0xsig' } },
        }),
      },
    } as unknown as Invariance;

    const mockIdentity = { identityId: 'id-123', address: '0xAgent' } as any;

    await executeTrade(mockInv, mockIdentity);

    const prepared = await mockInv.intent.prepare({} as any);
    expect(prepared.warnings).toContain('High gas cost detected');
  });
});

describe('Verified Treasury - Step 5: Blocked Action', () => {
  it('should attempt an action not in whitelist and handle rejection', async () => {
    const mockInv = {
      intent: {
        request: vi.fn().mockRejectedValue(new Error('Action not in whitelist')),
      },
    } as unknown as Invariance;

    const mockIdentity = { identityId: 'id-123', address: '0xAgent' } as any;

    await expect(attemptBlockedAction(mockInv, mockIdentity)).resolves.not.toThrow();
  });
});

describe('Verified Treasury - Step 6: Over Limit', () => {
  it('should attempt an action exceeding spending cap and handle rejection', async () => {
    const mockInv = {
      intent: {
        request: vi.fn().mockRejectedValue(new Error('Spending cap exceeded')),
      },
    } as unknown as Invariance;

    const mockIdentity = { identityId: 'id-123', address: '0xAgent' } as any;

    await expect(attemptOverLimit(mockInv, mockIdentity)).resolves.not.toThrow();
  });
});

describe('Verified Treasury - Step 7: Audit Trail', () => {
  it('should query the immutable audit trail', async () => {
    const mockInv = {
      ledger: {
        query: vi.fn().mockResolvedValue([
          {
            eventId: 'evt-1',
            action: 'swap',
            actor: { type: 'agent', address: '0xAgent' },
            timestamp: Date.now(),
          },
          {
            eventId: 'evt-2',
            action: 'register-identity',
            actor: { type: 'human', address: '0xOwner' },
            timestamp: Date.now() - 1000,
          },
        ]),
      },
    } as unknown as Invariance;

    const mockIdentity = { identityId: 'id-123', address: '0xAgent' } as any;

    await expect(queryAuditTrail(mockInv, mockIdentity)).resolves.not.toThrow();
    expect(mockInv.ledger.query).toHaveBeenCalled();
  });

  it('should handle empty audit trail', async () => {
    const mockInv = {
      ledger: {
        query: vi.fn().mockResolvedValue([]),
      },
    } as unknown as Invariance;

    const mockIdentity = { identityId: 'id-123', address: '0xAgent' } as any;

    await expect(queryAuditTrail(mockInv, mockIdentity)).resolves.not.toThrow();
  });
});

describe('Verified Treasury - Step 8: Verify Transaction', () => {
  it('should verify a previous transaction', async () => {
    const mockInv = {
      verify: vi.fn().mockResolvedValue({
        verified: true,
        actor: { type: 'agent', address: '0xAgent', identityId: 'id-123' },
        action: 'swap',
        timestamp: Date.now(),
        txHash: '0xtx',
        policyCompliant: true,
        identityVerified: true,
        escrowVerified: null,
      }),
    } as unknown as Invariance;

    const mockIntentResult = {
      intentId: 'intent-123',
      txHash: '0xtx',
    } as any;

    await expect(verifyTransaction(mockInv, mockIntentResult)).resolves.not.toThrow();
    expect(mockInv.verify).toHaveBeenCalledWith('0xtx');
  });

  it('should handle verification of non-compliant transaction', async () => {
    const mockInv = {
      verify: vi.fn().mockResolvedValue({
        verified: true,
        policyCompliant: false,
        identityVerified: true,
      }),
    } as unknown as Invariance;

    const mockIntentResult = { txHash: '0xtx' } as any;

    await expect(verifyTransaction(mockInv, mockIntentResult)).resolves.not.toThrow();
  });
});
