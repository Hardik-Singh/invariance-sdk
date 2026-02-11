import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IdentityManager } from '../../src/modules/identity/IdentityManager.js';
import { PolicyEngine } from '../../src/modules/policy/PolicyEngine.js';
import { EscrowManager } from '../../src/modules/escrow/EscrowManager.js';
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
import type { OnChainIdentity } from '../../src/modules/identity/types.js';
import type { OnChainPolicy, OnChainPolicyRule } from '../../src/modules/policy/types.js';
import type { OnChainEscrow } from '../../src/modules/escrow/types.js';
import { toBytes32 } from '../../src/utils/contract-helpers.js';

/**
 * Cross-Module Integration Tests
 *
 * These tests verify that IdentityManager, PolicyEngine, and EscrowManager
 * work together seamlessly with proper contract integration.
 */
describe('Cross-Module Integration', () => {
  let contracts: ContractFactory;
  let events: InvarianceEventEmitter;
  let telemetry: Telemetry;
  let identityManager: IdentityManager;
  let policyEngine: PolicyEngine;
  let escrowManager: EscrowManager;

  const TEST_IDENTITY_ID = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as `0x${string}`;
  const TEST_POLICY_ID = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as `0x${string}`;
  const TEST_ESCROW_ID = '0xfedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210' as `0x${string}`;
  const TEST_WALLET = '0x1111111111111111111111111111111111111111' as `0x${string}`;
  const TEST_OWNER = '0x2222222222222222222222222222222222222222' as `0x${string}`;
  const TEST_BENEFICIARY = '0x3333333333333333333333333333333333333333' as `0x${string}`;

  beforeEach(() => {
    events = createEventEmitter();
    telemetry = createTelemetry();
  });

  describe('PolicyEngine E2E Flow', () => {
    it('complete policy lifecycle: create → attach → evaluate → detach → revoke', async () => {
      // Mock data
      const mockIdentity: OnChainIdentity = {
        identityId: TEST_IDENTITY_ID,
        actorType: 0, // agent
        addr: TEST_WALLET,
        owner: TEST_OWNER,
        label: 'TestAgent',
        capabilities: ['swap', 'transfer'],
        status: 0, // active
        createdAt: 1700000000n,
        updatedAt: 1700000000n,
      };

      const mockPolicy: OnChainPolicy = {
        policyId: TEST_POLICY_ID,
        name: 'Test Policy',
        creator: TEST_OWNER,
        applicableActorTypes: [0], // agent
        state: 0, // active
        createdAt: 1700000000n,
        expiresAt: 0n,
      };

      const mockRules: OnChainPolicyRule[] = [
        { ruleType: 0, config: '0x00000000000000000000000000000000000000000000000000000000000186a0' as `0x${string}` }, // max-spend: 100000 wei
        { ruleType: 4, config: '0x' as `0x${string}` }, // action-whitelist
        { ruleType: 11, config: '0x' as `0x${string}` }, // time-window
      ];

      // Setup mock contracts
      const mockIdentityContract = createMockContract({
        read: {
          resolve: vi.fn().mockResolvedValue(TEST_IDENTITY_ID),
          get: vi.fn().mockResolvedValue(mockIdentity),
        },
        write: {
          register: vi.fn().mockResolvedValue('0xtx1'),
        },
      });

      const mockPolicyContract = createMockContract({
        read: {
          getPolicy: vi.fn().mockResolvedValue(mockPolicy),
          getRules: vi.fn().mockResolvedValue(mockRules),
          evaluate: vi.fn().mockResolvedValue([true, 0, '0x']), // [permitted, failedRuleIndex, reason]
        },
        write: {
          create: vi.fn().mockResolvedValue('0xtx2'),
          attach: vi.fn().mockResolvedValue('0xtx3'),
          detach: vi.fn().mockResolvedValue('0xtx4'),
          revoke: vi.fn().mockResolvedValue('0xtx5'),
        },
      });

      contracts = createMockContractFactory({
        contract: mockIdentityContract,
        publicClient: createMockPublicClient(),
      });

      // Override getContract to return different contracts based on name
      const originalGetContract = contracts.getContract.bind(contracts);
      vi.spyOn(contracts, 'getContract').mockImplementation((name: string) => {
        if (name === 'policy') return mockPolicyContract as ReturnType<typeof originalGetContract>;
        if (name === 'identity') return mockIdentityContract as ReturnType<typeof originalGetContract>;
        return originalGetContract(name);
      });

      identityManager = new IdentityManager(contracts, events, telemetry);
      policyEngine = new PolicyEngine(contracts, events, telemetry);

      // Step 1: Register identity
      const identity = await identityManager.register({
        type: 'agent',
        owner: TEST_OWNER,
        label: 'TestAgent',
        capabilities: ['swap', 'transfer'],
      });
      expect(identity.identityId).toBeTruthy();
      expect(identity.type).toBe('agent');

      // Step 2: Create policy with 3 rules
      const policy = await policyEngine.create({
        name: 'Test Policy',
        actor: 'agent',
        rules: [
          { type: 'max-spend', config: { limit: '100000' } },
          { type: 'action-whitelist', config: { actions: ['swap', 'transfer'] } },
          { type: 'time-window', config: { start: '09:00', end: '17:00', timezone: 'UTC' } },
        ],
      });
      expect(policy.policyId).toBeTruthy();
      expect(policy.rules).toHaveLength(3);

      // Step 3: Attach policy to identity
      await policyEngine.attach(policy.policyId, identity.identityId);
      expect(mockPolicyContract.write.attach).toHaveBeenCalled();

      // Step 4: Evaluate action (should pass)
      const evaluation = await policyEngine.evaluate({
        policyId: policy.policyId,
        actor: { type: 'agent', address: TEST_WALLET, identityId: identity.identityId },
        action: 'swap',
        params: { amount: '50000', token: 'USDC' },
      });
      expect(evaluation.allowed).toBe(true);
      expect(mockPolicyContract.read.evaluate).toHaveBeenCalled();

      // Step 5: Detach policy
      await policyEngine.detach(policy.policyId, identity.identityId);
      expect(mockPolicyContract.write.detach).toHaveBeenCalled();

      // Step 6: Revoke policy
      await policyEngine.revoke(policy.policyId);
      expect(mockPolicyContract.write.revoke).toHaveBeenCalled();
    });
  });

  describe('EscrowManager E2E Flow', () => {
    it('complete escrow lifecycle: create → fund → approve (multi-sig) → release', async () => {
      // Mock data
      const mockEscrow: OnChainEscrow = {
        escrowId: TEST_ESCROW_ID,
        depositorIdentityId: TEST_IDENTITY_ID,
        beneficiaryIdentityId: toBytes32('beneficiary-id'),
        depositor: TEST_WALLET,
        beneficiary: TEST_BENEFICIARY,
        amount: 250000000n, // 250 USDC
        fundedAmount: 250000000n,
        conditionType: 1, // multi-sig
        conditionData: '0x0000000000000000000000000000000000000000000000000000000000000003' as `0x${string}`, // threshold: 3
        state: 2, // active
        createdAt: 1700000000n,
        expiresAt: 1700086400n, // +24h
        releasedAt: 0n,
      };

      const mockUsdcContract = createMockContract({
        write: {
          approve: vi.fn().mockResolvedValue('0xtx_approve'),
        },
      });

      const mockIdentityContract = createMockContract({
        read: {
          resolve: vi.fn().mockResolvedValue(TEST_IDENTITY_ID),
        },
      });

      const mockEscrowContract = createMockContract({
        read: {
          getEscrow: vi.fn().mockResolvedValue(mockEscrow),
        },
        write: {
          create: vi.fn().mockResolvedValue('0xtx_create'),
          fund: vi.fn().mockResolvedValue('0xtx_fund'),
          approveRelease: vi.fn().mockResolvedValue('0xtx_approve1'),
          release: vi.fn().mockResolvedValue('0xtx_release'),
        },
      });

      contracts = createMockContractFactory({
        contract: mockEscrowContract,
        publicClient: createMockPublicClient(),
      });

      vi.spyOn(contracts, 'getContract').mockImplementation((name: string) => {
        if (name === 'escrow') return mockEscrowContract as ReturnType<ContractFactory['getContract']>;
        if (name === 'mockUsdc') return mockUsdcContract as ReturnType<ContractFactory['getContract']>;
        if (name === 'identity') return mockIdentityContract as ReturnType<ContractFactory['getContract']>;
        return createMockContract() as ReturnType<ContractFactory['getContract']>;
      });

      vi.spyOn(contracts, 'getWalletAddress').mockReturnValue(TEST_WALLET);

      escrowManager = new EscrowManager(contracts, events, telemetry);

      // Step 1: Create escrow with multi-sig condition (3 signers, threshold 2)
      const escrow = await escrowManager.create({
        depositor: { type: 'agent', address: TEST_WALLET },
        recipient: { type: 'agent', address: TEST_BENEFICIARY },
        amount: '250.00',
        conditions: {
          type: 'multi-sig',
          timeout: '24h',
          multiSig: {
            signers: [TEST_WALLET, TEST_OWNER, TEST_BENEFICIARY],
            threshold: 2,
          },
        },
      });
      expect(escrow.escrowId).toBeTruthy();
      expect(mockEscrowContract.write.create).toHaveBeenCalled();

      // Step 2: Fund escrow with USDC
      mockEscrow.state = 2; // active after funding
      mockEscrow.fundedAmount = 250000000n;
      await escrowManager.fund(escrow.escrowId);
      expect(mockUsdcContract.write.approve).toHaveBeenCalled(); // Step 1: Approve USDC
      expect(mockEscrowContract.write.fund).toHaveBeenCalled(); // Step 2: Fund escrow

      // Step 3: First signer approves
      const approval1 = await escrowManager.approve(escrow.escrowId);
      expect(approval1).toBeTruthy();

      // Step 4: Second signer approves (threshold met)
      const approval2 = await escrowManager.approve(escrow.escrowId);
      expect(approval2).toBeTruthy();

      // Step 5: Release escrow
      await escrowManager.release(escrow.escrowId);
      expect(mockEscrowContract.write.release).toHaveBeenCalled();
    });
  });

  describe('Full Integration: IdentityManager → PolicyEngine → EscrowManager', () => {
    it('complete flow: register identity → create policy → attach → create escrow → evaluate → release', async () => {
      // Mock data
      const mockIdentity: OnChainIdentity = {
        identityId: TEST_IDENTITY_ID,
        actorType: 0,
        addr: TEST_WALLET,
        owner: TEST_OWNER,
        label: 'PaymentAgent',
        capabilities: ['transfer'],
        status: 0,
        createdAt: 1700000000n,
        updatedAt: 1700000000n,
      };

      const mockPolicy: OnChainPolicy = {
        policyId: TEST_POLICY_ID,
        name: 'Payment Policy',
        creator: TEST_OWNER,
        applicableActorTypes: [0],
        state: 0,
        createdAt: 1700000000n,
        expiresAt: 0n,
      };

      const mockRules: OnChainPolicyRule[] = [
        { ruleType: 0, config: '0x00000000000000000000000000000000000000000000000000000000000186a0' as `0x${string}` }, // max-spend
      ];

      const mockEscrow: OnChainEscrow = {
        escrowId: TEST_ESCROW_ID,
        depositorIdentityId: TEST_IDENTITY_ID,
        beneficiaryIdentityId: toBytes32('recipient-id'),
        depositor: TEST_WALLET,
        beneficiary: TEST_BENEFICIARY,
        amount: 100000n,
        fundedAmount: 100000n,
        conditionType: 0,
        conditionData: '0x' as `0x${string}`,
        state: 2,
        createdAt: 1700000000n,
        expiresAt: 1700086400n,
        releasedAt: 0n,
      };

      // Setup all mock contracts
      const mockIdentityContract = createMockContract({
        read: {
          resolve: vi.fn().mockResolvedValue(TEST_IDENTITY_ID),
          get: vi.fn().mockResolvedValue(mockIdentity),
        },
        write: {
          register: vi.fn().mockResolvedValue('0xtx_identity'),
        },
      });

      const mockPolicyContract = createMockContract({
        read: {
          getPolicy: vi.fn().mockResolvedValue(mockPolicy),
          getRules: vi.fn().mockResolvedValue(mockRules),
          evaluate: vi.fn().mockResolvedValue([true, 0, '0x']),
        },
        write: {
          create: vi.fn().mockResolvedValue('0xtx_policy'),
          attach: vi.fn().mockResolvedValue('0xtx_attach'),
        },
      });

      const mockEscrowContract = createMockContract({
        read: {
          getEscrow: vi.fn().mockResolvedValue(mockEscrow),
        },
        write: {
          create: vi.fn().mockResolvedValue('0xtx_escrow'),
          fund: vi.fn().mockResolvedValue('0xtx_fund'),
          release: vi.fn().mockResolvedValue('0xtx_release'),
        },
      });

      const mockUsdcContract = createMockContract({
        write: {
          approve: vi.fn().mockResolvedValue('0xtx_usdc_approve'),
        },
      });

      contracts = createMockContractFactory({
        contract: mockIdentityContract,
        publicClient: createMockPublicClient(),
      });

      vi.spyOn(contracts, 'getContract').mockImplementation((name: string) => {
        if (name === 'identity') return mockIdentityContract as ReturnType<ContractFactory['getContract']>;
        if (name === 'policy') return mockPolicyContract as ReturnType<ContractFactory['getContract']>;
        if (name === 'escrow') return mockEscrowContract as ReturnType<ContractFactory['getContract']>;
        if (name === 'mockUsdc') return mockUsdcContract as ReturnType<ContractFactory['getContract']>;
        return createMockContract() as ReturnType<ContractFactory['getContract']>;
      });

      vi.spyOn(contracts, 'getWalletAddress').mockReturnValue(TEST_WALLET);

      // Initialize all managers
      identityManager = new IdentityManager(contracts, events, telemetry);
      policyEngine = new PolicyEngine(contracts, events, telemetry);
      escrowManager = new EscrowManager(contracts, events, telemetry);

      // Track events
      const eventLog: string[] = [];
      events.on('identity.registered', () => eventLog.push('identity.registered'));
      events.on('policy.created', () => eventLog.push('policy.created'));
      events.on('escrow.created', () => eventLog.push('escrow.created'));
      events.on('escrow.funded', () => eventLog.push('escrow.funded'));
      events.on('escrow.released', () => eventLog.push('escrow.released'));

      // === Step 1: Register Identity ===
      const identity = await identityManager.register({
        type: 'agent',
        owner: TEST_OWNER,
        label: 'PaymentAgent',
        capabilities: ['transfer'],
      });
      expect(identity.identityId).toBeTruthy();
      expect(identity.type).toBe('agent');

      // === Step 2: Create Policy ===
      const policy = await policyEngine.create({
        name: 'Payment Policy',
        actor: 'agent',
        rules: [
          { type: 'max-spend', config: { limit: '100000' } },
        ],
      });
      expect(policy.policyId).toBeTruthy();

      // === Step 3: Attach Policy to Identity ===
      await policyEngine.attach(policy.policyId, identity.identityId);
      expect(mockPolicyContract.write.attach).toHaveBeenCalled();

      // === Step 4: Create Escrow ===
      const escrow = await escrowManager.create({
        depositor: { type: 'agent', address: TEST_WALLET },
        recipient: { type: 'agent', address: TEST_BENEFICIARY },
        amount: '100.00',
        conditions: {
          type: 'task-completion',
          timeout: '24h',
        },
      });
      expect(escrow.escrowId).toBeTruthy();

      // === Step 5: Evaluate Action Against Policy (before releasing escrow) ===
      const evaluation = await policyEngine.evaluate({
        policyId: policy.policyId,
        actor: { type: 'agent', address: TEST_WALLET, identityId: identity.identityId },
        action: 'transfer',
        params: { amount: '100.00', recipient: TEST_BENEFICIARY },
      });
      expect(evaluation.allowed).toBe(true);

      // === Step 6: Release Escrow (action permitted by policy) ===
      await escrowManager.release(escrow.escrowId);
      expect(mockEscrowContract.write.release).toHaveBeenCalled();

      // Verify event sequence
      expect(eventLog).toContain('identity.registered');
      expect(eventLog).toContain('policy.created');
      expect(eventLog).toContain('escrow.created');
      expect(eventLog).toContain('escrow.released');
    });
  });

  describe('Contract Address Resolution', () => {
    it('all modules resolve correct contract addresses', () => {
      contracts = createMockContractFactory();
      policyEngine = new PolicyEngine(contracts, events, telemetry);
      escrowManager = new EscrowManager(contracts, events, telemetry);

      const policyAddr = policyEngine.getContractAddress();
      const escrowAddr = escrowManager.getContractAddress();

      expect(typeof policyAddr).toBe('string');
      expect(typeof escrowAddr).toBe('string');

      expect(policyAddr).toBe(contracts.getAddress('policy'));
      expect(escrowAddr).toBe(contracts.getAddress('escrow'));
    });
  });

  describe('Error Propagation Across Modules', () => {
    it('contract errors propagate correctly through module boundaries', async () => {
      const mockContract = createMockContract({
        write: {
          attach: vi.fn().mockRejectedValue(new Error('PolicyNotActive()')),
        },
      });

      contracts = createMockContractFactory({
        contract: mockContract,
        publicClient: createMockPublicClient(),
      });

      policyEngine = new PolicyEngine(contracts, events, telemetry);

      await expect(
        policyEngine.attach(TEST_POLICY_ID, TEST_IDENTITY_ID)
      ).rejects.toThrow();
    });
  });

  describe('Event Emission Across Modules', () => {
    it('events from multiple modules are properly typed and tracked', async () => {
      const mockIdentityContract = createMockContract({
        read: {
          resolve: vi.fn().mockResolvedValue(TEST_IDENTITY_ID),
          get: vi.fn().mockResolvedValue({
            identityId: TEST_IDENTITY_ID,
            actorType: 0,
            addr: TEST_WALLET,
            owner: TEST_OWNER,
            label: 'Test',
            capabilities: [],
            status: 0,
            createdAt: 1700000000n,
            updatedAt: 1700000000n,
          }),
        },
        write: {
          register: vi.fn().mockResolvedValue('0xtx1'),
        },
      });

      const mockPolicyContract = createMockContract({
        read: {
          getPolicy: vi.fn().mockResolvedValue({
            policyId: TEST_POLICY_ID,
            name: 'Test',
            creator: TEST_OWNER,
            applicableActorTypes: [0],
            state: 0,
            createdAt: 1700000000n,
            expiresAt: 0n,
          }),
          getRules: vi.fn().mockResolvedValue([]),
        },
        write: {
          create: vi.fn().mockResolvedValue('0xtx2'),
        },
      });

      contracts = createMockContractFactory({
        contract: mockIdentityContract,
        publicClient: createMockPublicClient(),
      });

      vi.spyOn(contracts, 'getContract').mockImplementation((name: string) => {
        if (name === 'identity') return mockIdentityContract as ReturnType<ContractFactory['getContract']>;
        if (name === 'policy') return mockPolicyContract as ReturnType<ContractFactory['getContract']>;
        return createMockContract() as ReturnType<ContractFactory['getContract']>;
      });

      identityManager = new IdentityManager(contracts, events, telemetry);
      policyEngine = new PolicyEngine(contracts, events, telemetry);

      const identityListener = vi.fn();
      const policyListener = vi.fn();

      events.on('identity.registered', identityListener);
      events.on('policy.created', policyListener);

      await identityManager.register({ type: 'agent', owner: TEST_OWNER, label: 'Test' });
      await policyEngine.create({ name: 'Test', actor: 'agent', rules: [] });

      expect(identityListener).toHaveBeenCalledOnce();
      expect(policyListener).toHaveBeenCalledOnce();
    });
  });
});
