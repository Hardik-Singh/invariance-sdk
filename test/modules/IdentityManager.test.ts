import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCode } from '@invariance/common';
import { IdentityManager } from '../../src/modules/identity/IdentityManager.js';
import { InvarianceError } from '../../src/errors/InvarianceError.js';
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
import { toBytes32 } from '../../src/utils/contract-helpers.js';
import type { OnChainIdentity, OnChainAttestation } from '../../src/modules/identity/types.js';

/** Helper to create a mock on-chain identity tuple */
function mockOnChainIdentity(overrides?: Partial<OnChainIdentity>): OnChainIdentity {
  return {
    identityId: toBytes32('test-id'),
    actorType: 0, // agent
    addr: '0x1111111111111111111111111111111111111111' as `0x${string}`,
    owner: '0x2222222222222222222222222222222222222222' as `0x${string}`,
    label: 'TestBot',
    capabilities: ['swap', 'transfer'],
    status: 0, // active
    createdAt: 1700000000n,
    updatedAt: 1700000000n,
    ...overrides,
  };
}

/** Helper to create a mock on-chain attestation tuple */
function mockOnChainAttestation(overrides?: Partial<OnChainAttestation>): OnChainAttestation {
  return {
    attestationId: '0xatt1000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
    identityId: toBytes32('test-id'),
    attester: '0x3333333333333333333333333333333333333333' as `0x${string}`,
    claim: 'kyc-verified',
    evidenceHash: '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
    expiresAt: 0n,
    createdAt: 1700000000n,
    revoked: false,
    ...overrides,
  };
}

describe('IdentityManager', () => {
  let factory: ContractFactory;
  let mockContract: ReturnType<typeof createMockContract>;
  let mockPublicClient: ReturnType<typeof createMockPublicClient>;
  let events: InvarianceEventEmitter;
  let telemetry: Telemetry;
  let identity: IdentityManager;

  beforeEach(() => {
    const mocks = createMockContractFactory();
    factory = mocks.factory;
    mockContract = mocks.mockContract;
    mockPublicClient = mocks.mockPublicClient;
    events = createEventEmitter();
    telemetry = createTelemetry();
    identity = new IdentityManager(factory, events, telemetry);
  });

  describe('register()', () => {
    it('calls contract.write.register with correct args', async () => {
      const rawIdentity = mockOnChainIdentity();
      mockContract.write.register.mockResolvedValue('0xtxhash' as `0x${string}`);
      mockContract.read.resolve.mockResolvedValue(rawIdentity.identityId);
      mockContract.read.get.mockResolvedValue(rawIdentity);

      await identity.register({
        type: 'agent',
        owner: '0x2222222222222222222222222222222222222222',
        label: 'TestBot',
        capabilities: ['swap', 'transfer'],
      });

      expect(mockContract.write.register).toHaveBeenCalledOnce();
      const args = mockContract.write.register.mock.calls[0]![0] as unknown[];
      // addr = owner when no address provided
      expect(args[0]).toBe('0x2222222222222222222222222222222222222222');
      // actorType = 0 (agent)
      expect(args[1]).toBe(0);
      // label
      expect(args[2]).toBe('TestBot');
      // capabilities
      expect(args[3]).toEqual(['swap', 'transfer']);
    });

    it('returns mapped Identity with correct fields', async () => {
      const rawIdentity = mockOnChainIdentity();
      mockContract.write.register.mockResolvedValue('0xtxhash' as `0x${string}`);
      mockContract.read.resolve.mockResolvedValue(rawIdentity.identityId);
      mockContract.read.get.mockResolvedValue(rawIdentity);

      const result = await identity.register({
        type: 'agent',
        owner: '0x2222222222222222222222222222222222222222',
        label: 'TestBot',
      });

      expect(result.type).toBe('agent');
      expect(result.owner).toBe('0x2222222222222222222222222222222222222222');
      expect(result.label).toBe('TestBot');
      expect(result.status).toBe('active');
      expect(result.capabilities).toEqual(['swap', 'transfer']);
    });

    it('uses provided address when given', async () => {
      const customAddr = '0x4444444444444444444444444444444444444444' as `0x${string}`;
      const rawIdentity = mockOnChainIdentity({ addr: customAddr });
      mockContract.write.register.mockResolvedValue('0xtxhash' as `0x${string}`);
      mockContract.read.resolve.mockResolvedValue(rawIdentity.identityId);
      mockContract.read.get.mockResolvedValue(rawIdentity);

      await identity.register({
        type: 'agent',
        owner: '0x2222222222222222222222222222222222222222',
        label: 'Bot',
        address: '0x4444444444444444444444444444444444444444',
      });

      const args = mockContract.write.register.mock.calls[0]![0] as unknown[];
      expect(args[0]).toBe('0x4444444444444444444444444444444444444444');
    });

    it('defaults capabilities to empty array', async () => {
      const rawIdentity = mockOnChainIdentity({ capabilities: [] });
      mockContract.write.register.mockResolvedValue('0xtxhash' as `0x${string}`);
      mockContract.read.resolve.mockResolvedValue(rawIdentity.identityId);
      mockContract.read.get.mockResolvedValue(rawIdentity);

      await identity.register({
        type: 'agent',
        owner: '0x2222222222222222222222222222222222222222',
        label: 'Bot',
      });

      const args = mockContract.write.register.mock.calls[0]![0] as unknown[];
      expect(args[3]).toEqual([]);
    });

    it('emits identity.registered event after tx success', async () => {
      const rawIdentity = mockOnChainIdentity();
      mockContract.write.register.mockResolvedValue('0xtxhash' as `0x${string}`);
      mockContract.read.resolve.mockResolvedValue(rawIdentity.identityId);
      mockContract.read.get.mockResolvedValue(rawIdentity);

      const listener = vi.fn();
      events.on('identity.registered', listener);

      await identity.register({
        type: 'agent',
        owner: '0x2222222222222222222222222222222222222222',
        label: 'Bot',
      });

      expect(listener).toHaveBeenCalledOnce();
      expect(listener.mock.calls[0]![0]).toHaveProperty('identityId');
      expect(listener.mock.calls[0]![0]).toHaveProperty('address');
    });

    it('calls telemetry.track', async () => {
      const rawIdentity = mockOnChainIdentity();
      mockContract.write.register.mockResolvedValue('0xtxhash' as `0x${string}`);
      mockContract.read.resolve.mockResolvedValue(rawIdentity.identityId);
      mockContract.read.get.mockResolvedValue(rawIdentity);

      const trackSpy = vi.spyOn(telemetry, 'track');

      await identity.register({
        type: 'agent',
        owner: '0x2222222222222222222222222222222222222222',
        label: 'Bot',
      });

      expect(trackSpy).toHaveBeenCalledWith('identity.register', {
        type: 'agent',
      });
    });

    it('maps actor types correctly', async () => {
      for (const [type, enumVal] of [
        ['agent', 0],
        ['human', 1],
        ['device', 2],
        ['service', 3],
      ] as const) {
        const rawIdentity = mockOnChainIdentity({ actorType: enumVal });
        mockContract.write.register.mockResolvedValue('0xtxhash' as `0x${string}`);
        mockContract.read.resolve.mockResolvedValue(rawIdentity.identityId);
        mockContract.read.get.mockResolvedValue(rawIdentity);

        await identity.register({
          type,
          owner: '0x2222222222222222222222222222222222222222',
          label: 'Bot',
        });

        const args = mockContract.write.register.mock.calls.at(-1)![0] as unknown[];
        expect(args[1]).toBe(enumVal);
      }
    });
  });

  describe('get()', () => {
    it('calls resolve then get on the contract', async () => {
      const identityId = toBytes32('test-id');
      const rawIdentity = mockOnChainIdentity();
      mockContract.read.resolve.mockResolvedValue(identityId);
      mockContract.read.get.mockResolvedValue(rawIdentity);

      await identity.get('0x1111111111111111111111111111111111111111');

      expect(mockContract.read.resolve).toHaveBeenCalledOnce();
      expect(mockContract.read.get).toHaveBeenCalledWith([identityId]);
    });

    it('returns mapped Identity', async () => {
      const rawIdentity = mockOnChainIdentity();
      mockContract.read.resolve.mockResolvedValue(rawIdentity.identityId);
      mockContract.read.get.mockResolvedValue(rawIdentity);

      const result = await identity.get('0x1111111111111111111111111111111111111111');

      expect(result.type).toBe('agent');
      expect(result.label).toBe('TestBot');
      expect(result.status).toBe('active');
    });

    it('throws IDENTITY_NOT_FOUND when resolve returns zero bytes32', async () => {
      mockContract.read.resolve.mockResolvedValue(
        '0x0000000000000000000000000000000000000000000000000000000000000000',
      );

      await expect(
        identity.get('0x1111111111111111111111111111111111111111'),
      ).rejects.toMatchObject({
        code: ErrorCode.IDENTITY_NOT_FOUND,
      });
    });
  });

  describe('resolve()', () => {
    it('resolves a 0x address via contract.read.resolve', async () => {
      const rawIdentity = mockOnChainIdentity();
      mockContract.read.resolve.mockResolvedValue(rawIdentity.identityId);
      mockContract.read.get.mockResolvedValue(rawIdentity);

      await identity.resolve('0x1111111111111111111111111111111111111111');

      expect(mockContract.read.resolve).toHaveBeenCalledWith([
        '0x1111111111111111111111111111111111111111',
      ]);
    });

    it('treats non-address input as identityId and calls get directly', async () => {
      const rawIdentity = mockOnChainIdentity();
      mockContract.read.get.mockResolvedValue(rawIdentity);

      await identity.resolve('my-identity-id');

      // Should NOT call resolve for non-address input
      expect(mockContract.read.resolve).not.toHaveBeenCalled();
      expect(mockContract.read.get).toHaveBeenCalledWith([toBytes32('my-identity-id')]);
    });

    it('throws IDENTITY_NOT_FOUND when address resolves to zero', async () => {
      mockContract.read.resolve.mockResolvedValue(
        '0x0000000000000000000000000000000000000000000000000000000000000000',
      );

      await expect(
        identity.resolve('0x1111111111111111111111111111111111111111'),
      ).rejects.toMatchObject({
        code: ErrorCode.IDENTITY_NOT_FOUND,
      });
    });
  });

  describe('update()', () => {
    it('calls contract.write.update with bytes32 id', async () => {
      const rawIdentity = mockOnChainIdentity({ label: 'UpdatedBot' });
      mockContract.write.update.mockResolvedValue('0xtxhash' as `0x${string}`);
      mockContract.read.get.mockResolvedValue(rawIdentity);

      await identity.update('test-id', { label: 'UpdatedBot', capabilities: ['new-cap'] });

      expect(mockContract.write.update).toHaveBeenCalledWith([
        toBytes32('test-id'),
        'UpdatedBot',
        ['new-cap'],
      ]);
    });

    it('defaults label and capabilities when not provided', async () => {
      const rawIdentity = mockOnChainIdentity();
      mockContract.write.update.mockResolvedValue('0xtxhash' as `0x${string}`);
      mockContract.read.get.mockResolvedValue(rawIdentity);

      await identity.update('test-id', {});

      const args = mockContract.write.update.mock.calls[0]![0] as unknown[];
      expect(args[1]).toBe('');
      expect(args[2]).toEqual([]);
    });

    it('returns updated identity after re-fetch', async () => {
      const rawIdentity = mockOnChainIdentity({ label: 'NewLabel' });
      mockContract.write.update.mockResolvedValue('0xtxhash' as `0x${string}`);
      mockContract.read.get.mockResolvedValue(rawIdentity);

      const result = await identity.update('test-id', { label: 'NewLabel' });

      expect(result.label).toBe('NewLabel');
    });
  });

  describe('pause()', () => {
    it('calls contract.write.pauseIdentity with bytes32 id', async () => {
      mockContract.write.pauseIdentity.mockResolvedValue('0xtxhash' as `0x${string}`);

      await identity.pause('test-id');

      expect(mockContract.write.pauseIdentity).toHaveBeenCalledWith([
        toBytes32('test-id'),
      ]);
    });

    it('emits identity.paused event AFTER successful tx', async () => {
      mockContract.write.pauseIdentity.mockResolvedValue('0xtxhash' as `0x${string}`);

      const listener = vi.fn();
      events.on('identity.paused', listener);

      await identity.pause('test-id');

      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith({ identityId: 'test-id' });
    });

    it('does NOT emit event when tx fails', async () => {
      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        transactionHash: '0xtxhash',
        blockNumber: 100n,
        gasUsed: 21000n,
        status: 'reverted',
        logs: [],
      });
      mockContract.write.pauseIdentity.mockResolvedValue('0xtxhash' as `0x${string}`);

      const listener = vi.fn();
      events.on('identity.paused', listener);

      await expect(identity.pause('test-id')).rejects.toThrow(InvarianceError);
      expect(listener).not.toHaveBeenCalled();
    });

    it('returns PauseResult with correct identityId', async () => {
      mockContract.write.pauseIdentity.mockResolvedValue('0xtxhash' as `0x${string}`);

      const result = await identity.pause('test-id');

      expect(result.identityId).toBe('test-id');
      expect(result.status).toBe('suspended');
      expect(result.resumable).toBe(true);
    });
  });

  describe('resume()', () => {
    it('calls contract.write.resume with bytes32 id', async () => {
      mockContract.write.resume.mockResolvedValue('0xtxhash' as `0x${string}`);

      await identity.resume('test-id');

      expect(mockContract.write.resume).toHaveBeenCalledWith([
        toBytes32('test-id'),
      ]);
    });

    it('emits identity.resumed event after tx', async () => {
      mockContract.write.resume.mockResolvedValue('0xtxhash' as `0x${string}`);

      const listener = vi.fn();
      events.on('identity.resumed', listener);

      await identity.resume('test-id');

      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith({ identityId: 'test-id' });
    });

    it('returns TxReceipt', async () => {
      mockContract.write.resume.mockResolvedValue('0xtxhash' as `0x${string}`);

      const result = await identity.resume('test-id');

      expect(result).toHaveProperty('txHash');
      expect(result).toHaveProperty('blockNumber');
      expect(result).toHaveProperty('gasUsed');
      expect(result.status).toBe('success');
    });
  });

  describe('deactivate()', () => {
    it('calls contract.write.deactivate with bytes32 id', async () => {
      mockContract.write.deactivate.mockResolvedValue('0xtxhash' as `0x${string}`);

      await identity.deactivate('test-id');

      expect(mockContract.write.deactivate).toHaveBeenCalledWith([
        toBytes32('test-id'),
      ]);
    });

    it('returns TxReceipt', async () => {
      mockContract.write.deactivate.mockResolvedValue('0xtxhash' as `0x${string}`);

      const result = await identity.deactivate('test-id');

      expect(result.txHash).toBe('0xabc123');
      expect(result.status).toBe('success');
    });
  });

  describe('list()', () => {
    it('returns empty array when indexer is unavailable and on-chain fallback runs', async () => {
      // Mock fetch to fail (indexer unavailable)
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')));

      mockContract.read.identityCount.mockResolvedValue(0n);

      const result = await identity.list();
      expect(result).toEqual([]);

      vi.unstubAllGlobals();
    });

    it('queries indexer with filters when available', async () => {
      const mockIdentities = [
        { identityId: 'id1', type: 'agent', status: 'active' },
      ];

      vi.stubGlobal(
        'fetch',
        vi.fn()
          .mockResolvedValueOnce({ ok: true }) // health check
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(mockIdentities),
          }),
      );

      const result = await identity.list({ type: 'agent', status: 'active' });
      expect(result).toEqual(mockIdentities);

      vi.unstubAllGlobals();
    });
  });

  describe('attest()', () => {
    it('calls contract.write.attest with correct args', async () => {
      const attestation = mockOnChainAttestation();
      mockContract.write.attest.mockResolvedValue('0xtxhash' as `0x${string}`);
      mockContract.read.getAttestations.mockResolvedValue([attestation]);

      await identity.attest('test-id', {
        claim: 'kyc-verified',
        attester: '0x3333333333333333333333333333333333333333',
      });

      expect(mockContract.write.attest).toHaveBeenCalledOnce();
      const args = mockContract.write.attest.mock.calls[0]![0] as unknown[];
      expect(args[0]).toBe(toBytes32('test-id'));
      expect(args[1]).toBe('kyc-verified');
    });

    it('returns mapped Attestation', async () => {
      const attestation = mockOnChainAttestation();
      mockContract.write.attest.mockResolvedValue('0xtxhash' as `0x${string}`);
      mockContract.read.getAttestations.mockResolvedValue([attestation]);

      const result = await identity.attest('test-id', {
        claim: 'kyc-verified',
        attester: '0x3333333333333333333333333333333333333333',
      });

      expect(result.claim).toBe('kyc-verified');
      expect(result.verified).toBe(true);
    });
  });

  describe('attestations()', () => {
    it('calls contract.read.getAttestations', async () => {
      const attestation = mockOnChainAttestation();
      mockContract.read.getAttestations.mockResolvedValue([attestation]);

      const result = await identity.attestations('test-id');

      expect(mockContract.read.getAttestations).toHaveBeenCalledWith([
        toBytes32('test-id'),
      ]);
      expect(result).toHaveLength(1);
      expect(result[0]!.claim).toBe('kyc-verified');
    });

    it('returns empty array when no attestations', async () => {
      mockContract.read.getAttestations.mockResolvedValue([]);

      const result = await identity.attestations('test-id');
      expect(result).toEqual([]);
    });
  });

  describe('error mapping', () => {
    it('maps IdentityNotFound contract error', async () => {
      mockContract.read.resolve.mockRejectedValue({
        name: 'ContractFunctionRevertedError',
        data: { errorName: 'IdentityNotFound' },
        message: 'IdentityNotFound',
      });

      await expect(
        identity.get('0x1111111111111111111111111111111111111111'),
      ).rejects.toMatchObject({
        code: ErrorCode.IDENTITY_NOT_FOUND,
      });
    });

    it('maps NotIdentityOwner contract error', async () => {
      mockContract.write.pauseIdentity.mockRejectedValue({
        name: 'ContractFunctionRevertedError',
        data: { errorName: 'NotIdentityOwner' },
        message: 'NotIdentityOwner',
      });

      await expect(identity.pause('test-id')).rejects.toMatchObject({
        code: ErrorCode.NOT_AUTHORIZED_SIGNER,
      });
    });

    it('maps AddressAlreadyRegistered contract error', async () => {
      mockContract.write.register.mockRejectedValue({
        name: 'ContractFunctionRevertedError',
        data: { errorName: 'AddressAlreadyRegistered' },
        message: 'AddressAlreadyRegistered',
      });

      await expect(
        identity.register({
          type: 'agent',
          owner: '0x2222222222222222222222222222222222222222',
          label: 'Bot',
        }),
      ).rejects.toMatchObject({
        code: ErrorCode.POLICY_VIOLATION,
      });
    });

    it('maps generic errors to NETWORK_ERROR', async () => {
      mockContract.read.resolve.mockRejectedValue(new Error('connection failed'));

      await expect(
        identity.get('0x1111111111111111111111111111111111111111'),
      ).rejects.toMatchObject({
        code: ErrorCode.NETWORK_ERROR,
      });
    });
  });
});
