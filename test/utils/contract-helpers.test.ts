import { describe, it, expect, vi } from 'vitest';
import { ErrorCode } from '@invariance/common';
import {
  actorTypeToEnum,
  enumToActorType,
  identityStatusFromEnum,
  toBytes32,
  fromBytes32,
  waitForReceipt,
  mapContractError,
  generateActorSignatureEIP712,
  generatePlatformAttestationEIP712,
} from '../../src/utils/contract-helpers.js';
import { InvarianceError } from '../../src/errors/InvarianceError.js';

describe('contract-helpers', () => {
  describe('actorTypeToEnum', () => {
    it('maps agent to 0', () => {
      expect(actorTypeToEnum('agent')).toBe(0);
    });

    it('maps human to 1', () => {
      expect(actorTypeToEnum('human')).toBe(1);
    });

    it('maps device to 2', () => {
      expect(actorTypeToEnum('device')).toBe(2);
    });

    it('maps service to 3', () => {
      expect(actorTypeToEnum('service')).toBe(3);
    });
  });

  describe('enumToActorType', () => {
    it('maps 0 to agent', () => {
      expect(enumToActorType(0)).toBe('agent');
    });

    it('maps 1 to human', () => {
      expect(enumToActorType(1)).toBe('human');
    });

    it('maps 2 to device', () => {
      expect(enumToActorType(2)).toBe('device');
    });

    it('maps 3 to service', () => {
      expect(enumToActorType(3)).toBe('service');
    });

    it('throws on unknown value', () => {
      expect(() => enumToActorType(99)).toThrow(InvarianceError);
    });
  });

  describe('actorType roundtrip', () => {
    it('roundtrips all 4 types', () => {
      for (const type of ['agent', 'human', 'device', 'service'] as const) {
        expect(enumToActorType(actorTypeToEnum(type))).toBe(type);
      }
    });
  });

  describe('identityStatusFromEnum', () => {
    it('maps 0 to active', () => {
      expect(identityStatusFromEnum(0)).toBe('active');
    });

    it('maps 1 to suspended', () => {
      expect(identityStatusFromEnum(1)).toBe('suspended');
    });

    it('maps 2 to deactivated', () => {
      expect(identityStatusFromEnum(2)).toBe('deactivated');
    });

    it('throws INVALID_ACTOR_TYPE on unknown value', () => {
      expect(() => identityStatusFromEnum(99)).toThrow(InvarianceError);
      try {
        identityStatusFromEnum(99);
      } catch (e) {
        expect((e as InvarianceError).code).toBe(ErrorCode.INVALID_INPUT);
      }
    });
  });

  describe('toBytes32', () => {
    it('pads short strings to 32 bytes', () => {
      const result = toBytes32('hello');
      expect(result).toMatch(/^0x[0-9a-f]{64}$/);
      expect(result.startsWith('0x68656c6c6f')).toBe(true);
    });

    it('returns existing bytes32 hex as-is', () => {
      const hex = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      expect(toBytes32(hex)).toBe(hex);
    });

    it('handles empty string', () => {
      const result = toBytes32('');
      expect(result).toBe('0x' + '0'.repeat(64));
    });

    it('throws for strings longer than 32 bytes', () => {
      const longStr = 'a'.repeat(100);
      expect(() => toBytes32(longStr)).toThrow('ID exceeds 32 bytes');
    });
  });

  describe('fromBytes32', () => {
    it('decodes a padded bytes32 back to string', () => {
      const bytes = toBytes32('hello');
      expect(fromBytes32(bytes)).toBe('hello');
    });

    it('returns empty string for all zeros', () => {
      const zeros = ('0x' + '0'.repeat(64)) as `0x${string}`;
      expect(fromBytes32(zeros)).toBe('');
    });

    it('roundtrips with toBytes32', () => {
      for (const str of ['test', 'hello-world', 'inv_id_123']) {
        expect(fromBytes32(toBytes32(str))).toBe(str);
      }
    });
  });

  describe('waitForReceipt', () => {
    it('returns parsed receipt on success', async () => {
      const mockClient = {
        waitForTransactionReceipt: vi.fn().mockResolvedValue({
          transactionHash: '0xabc',
          blockNumber: 42n,
          gasUsed: 21000n,
          status: 'success',
          logs: [],
        }),
      };

      const result = await waitForReceipt(
        mockClient as unknown as Parameters<typeof waitForReceipt>[0],
        '0xabc' as `0x${string}`,
      );

      expect(result.txHash).toBe('0xabc');
      expect(result.blockNumber).toBe(42);
      expect(result.gasUsed).toBe('21000');
      expect(result.status).toBe('success');
    });

    it('throws TX_REVERTED on reverted tx', async () => {
      const mockClient = {
        waitForTransactionReceipt: vi.fn().mockResolvedValue({
          transactionHash: '0xfail',
          blockNumber: 42n,
          gasUsed: 21000n,
          status: 'reverted',
          logs: [],
        }),
      };

      await expect(
        waitForReceipt(
          mockClient as unknown as Parameters<typeof waitForReceipt>[0],
          '0xfail' as `0x${string}`,
        ),
      ).rejects.toMatchObject({
        code: ErrorCode.TX_REVERTED,
      });
    });
  });

  describe('mapContractError', () => {
    it('returns InvarianceError as-is', () => {
      const original = new InvarianceError(ErrorCode.IDENTITY_NOT_FOUND, 'test');
      expect(mapContractError(original)).toBe(original);
    });

    it('maps IdentityNotFound to IDENTITY_NOT_FOUND', () => {
      const err = {
        name: 'ContractFunctionRevertedError',
        data: { errorName: 'IdentityNotFound' },
        message: 'IdentityNotFound',
      };
      const result = mapContractError(err);
      expect(result.code).toBe(ErrorCode.IDENTITY_NOT_FOUND);
    });

    it('maps NotIdentityOwner to NOT_AUTHORIZED_SIGNER', () => {
      const err = {
        name: 'ContractFunctionRevertedError',
        data: { errorName: 'NotIdentityOwner' },
        message: 'NotIdentityOwner',
      };
      const result = mapContractError(err);
      expect(result.code).toBe(ErrorCode.NOT_AUTHORIZED_SIGNER);
    });

    it('maps AddressAlreadyRegistered to INVALID_INPUT', () => {
      const err = {
        name: 'ContractFunctionRevertedError',
        data: { errorName: 'AddressAlreadyRegistered' },
        message: 'AddressAlreadyRegistered',
      };
      const result = mapContractError(err);
      expect(result.code).toBe(ErrorCode.INVALID_INPUT);
    });

    it('maps unknown contract revert to TX_REVERTED', () => {
      const err = {
        name: 'ContractFunctionRevertedError',
        data: { errorName: 'SomeUnknownError' },
        message: 'SomeUnknownError',
      };
      const result = mapContractError(err);
      expect(result.code).toBe(ErrorCode.TX_REVERTED);
    });

    it('maps generic Error to NETWORK_ERROR', () => {
      const result = mapContractError(new Error('connection failed'));
      expect(result.code).toBe(ErrorCode.NETWORK_ERROR);
    });

    it('maps unknown non-Error to NETWORK_ERROR', () => {
      const result = mapContractError('some string error');
      expect(result.code).toBe(ErrorCode.NETWORK_ERROR);
    });
  });

  describe('generateActorSignatureEIP712', () => {
    const domain = {
      name: 'InvarianceCompactLedger',
      version: '1',
      chainId: 84532,
      verifyingContract: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
    };

    const input = {
      actorIdentityId: '0x0000000000000000000000000000000000000000000000000000000000000001' as `0x${string}`,
      actorAddress: '0x1111111111111111111111111111111111111111',
      action: 'test-action',
      category: 'custom',
      metadataHash: '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
      proofHash: '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
      severity: 0,
      nonce: 0n,
    };

    it('throws when wallet has no account', async () => {
      const walletClient = { account: undefined } as never;
      await expect(generateActorSignatureEIP712(input, domain, walletClient))
        .rejects.toThrow('EIP-712 signing requires a connected wallet account');
    });

    it('calls signTypedData with correct EIP-712 params', async () => {
      const signTypedData = vi.fn().mockResolvedValue('0xsig');
      const walletClient = {
        account: { address: '0x1111111111111111111111111111111111111111' },
        signTypedData,
      } as never;

      const result = await generateActorSignatureEIP712(input, domain, walletClient);

      expect(result).toBe('0xsig');
      expect(signTypedData).toHaveBeenCalledWith(
        expect.objectContaining({
          domain,
          primaryType: 'CompactLogInput',
          message: expect.objectContaining({ action: 'test-action', nonce: 0n }),
        }),
      );
    });
  });

  describe('generatePlatformAttestationEIP712', () => {
    const input = {
      actorIdentityId: '0x0000000000000000000000000000000000000000000000000000000000000001' as `0x${string}`,
      actorAddress: '0x1111111111111111111111111111111111111111',
      action: 'test-action',
      category: 'custom',
      metadataHash: '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
      proofHash: '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
      severity: 0,
      nonce: 0n,
    };

    it('throws when no API key is provided', async () => {
      await expect(generatePlatformAttestationEIP712(input, undefined))
        .rejects.toThrow('CompactLedger requires an API key');
    });

    it('throws when API returns non-OK response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));

      await expect(generatePlatformAttestationEIP712(input, 'inv_test_key'))
        .rejects.toThrow('Platform attestation API returned 401');

      vi.unstubAllGlobals();
    });

    it('calls /v1/attest with mode eip712 and returns signature', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { signature: '0xplatformsig' } }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await generatePlatformAttestationEIP712(input, 'inv_test_key', 'https://api.test.com');

      expect(result).toBe('0xplatformsig');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/v1/attest',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer inv_test_key',
          }),
        }),
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.mode).toBe('eip712');
      expect(body.input.action).toBe('test-action');

      vi.unstubAllGlobals();
    });
  });
});
