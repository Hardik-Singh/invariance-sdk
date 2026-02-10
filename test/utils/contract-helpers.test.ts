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

    it('throws on unknown value', () => {
      expect(() => identityStatusFromEnum(99)).toThrow(InvarianceError);
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

    it('truncates strings longer than 32 bytes', () => {
      const longStr = 'a'.repeat(100);
      const result = toBytes32(longStr);
      expect(result.length).toBe(66); // 0x + 64 hex chars
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

    it('maps AddressAlreadyRegistered to POLICY_VIOLATION', () => {
      const err = {
        name: 'ContractFunctionRevertedError',
        data: { errorName: 'AddressAlreadyRegistered' },
        message: 'AddressAlreadyRegistered',
      };
      const result = mapContractError(err);
      expect(result.code).toBe(ErrorCode.POLICY_VIOLATION);
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
});
