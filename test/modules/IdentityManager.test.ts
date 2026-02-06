import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCode } from '@invariance/common';
import { IdentityManager } from '../../src/modules/identity/IdentityManager.js';
import { InvarianceError } from '../../src/errors/InvarianceError.js';
import {
  createContractFactory,
  createEventEmitter,
  createTelemetry,
} from '../fixtures/mocks.js';
import type { InvarianceEventEmitter } from '../../src/core/EventEmitter.js';
import type { Telemetry } from '../../src/core/Telemetry.js';
import type { ContractFactory } from '../../src/core/ContractFactory.js';

describe('IdentityManager', () => {
  let contracts: ContractFactory;
  let events: InvarianceEventEmitter;
  let telemetry: Telemetry;
  let identity: IdentityManager;

  beforeEach(() => {
    contracts = createContractFactory();
    events = createEventEmitter();
    telemetry = createTelemetry();
    identity = new IdentityManager(contracts, events, telemetry);
  });

  describe('register()', () => {
    it('returns an Identity with correct type, owner, label', async () => {
      const result = await identity.register({
        type: 'agent',
        owner: '0xDev',
        label: 'TestBot',
      });
      expect(result.type).toBe('agent');
      expect(result.owner).toBe('0xDev');
      expect(result.label).toBe('TestBot');
    });

    it('returns an Identity with status active', async () => {
      const result = await identity.register({
        type: 'human',
        owner: '0xHuman',
        label: 'Alice',
      });
      expect(result.status).toBe('active');
    });

    it('generates identityId with inv_id_ prefix', async () => {
      const result = await identity.register({
        type: 'agent',
        owner: '0xDev',
        label: 'Bot',
      });
      expect(result.identityId).toMatch(/^inv_id_/);
    });

    it('defaults address to zero address when not provided', async () => {
      const result = await identity.register({
        type: 'agent',
        owner: '0xDev',
        label: 'Bot',
      });
      expect(result.address).toBe(
        '0x0000000000000000000000000000000000000000',
      );
    });

    it('uses provided address when given', async () => {
      const result = await identity.register({
        type: 'agent',
        owner: '0xDev',
        label: 'Bot',
        address: '0xCustomAddress',
      });
      expect(result.address).toBe('0xCustomAddress');
    });

    it('includes capabilities when provided', async () => {
      const result = await identity.register({
        type: 'agent',
        owner: '0xDev',
        label: 'Bot',
        capabilities: ['swap', 'transfer'],
      });
      expect(result.capabilities).toEqual(['swap', 'transfer']);
    });

    it('defaults capabilities to empty array', async () => {
      const result = await identity.register({
        type: 'agent',
        owner: '0xDev',
        label: 'Bot',
      });
      expect(result.capabilities).toEqual([]);
    });

    it('emits identity.registered event', async () => {
      const listener = vi.fn();
      events.on('identity.registered', listener);

      await identity.register({
        type: 'agent',
        owner: '0xDev',
        label: 'Bot',
      });

      expect(listener).toHaveBeenCalledOnce();
      expect(listener.mock.calls[0][0]).toHaveProperty('identityId');
      expect(listener.mock.calls[0][0]).toHaveProperty('address');
    });

    it('calls telemetry.track', async () => {
      const trackSpy = vi.spyOn(telemetry, 'track');

      await identity.register({
        type: 'agent',
        owner: '0xDev',
        label: 'Bot',
      });

      expect(trackSpy).toHaveBeenCalledWith('identity.register', {
        type: 'agent',
      });
    });
  });

  describe('get()', () => {
    it('throws InvarianceError with IDENTITY_NOT_FOUND', async () => {
      await expect(identity.get('0xUnknown')).rejects.toThrow(InvarianceError);
      await expect(identity.get('0xUnknown')).rejects.toMatchObject({
        code: ErrorCode.IDENTITY_NOT_FOUND,
      });
    });
  });

  describe('resolve()', () => {
    it('throws InvarianceError with IDENTITY_NOT_FOUND', async () => {
      await expect(identity.resolve('inv_id_123')).rejects.toThrow(
        InvarianceError,
      );
      await expect(identity.resolve('inv_id_123')).rejects.toMatchObject({
        code: ErrorCode.IDENTITY_NOT_FOUND,
      });
    });
  });

  describe('update()', () => {
    it('throws InvarianceError with IDENTITY_NOT_FOUND', async () => {
      await expect(
        identity.update('inv_id_123', { label: 'NewLabel' }),
      ).rejects.toThrow(InvarianceError);
      await expect(
        identity.update('inv_id_123', { label: 'NewLabel' }),
      ).rejects.toMatchObject({
        code: ErrorCode.IDENTITY_NOT_FOUND,
      });
    });
  });

  describe('pause()', () => {
    it('emits identity.paused event before throwing', async () => {
      const listener = vi.fn();
      events.on('identity.paused', listener);

      await expect(identity.pause('inv_id_123')).rejects.toThrow(
        InvarianceError,
      );

      // Known behavior: event emitted before throw (PR #5 fixes this)
      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith({ identityId: 'inv_id_123' });
    });

    it('throws InvarianceError with IDENTITY_NOT_FOUND', async () => {
      await expect(identity.pause('inv_id_123')).rejects.toMatchObject({
        code: ErrorCode.IDENTITY_NOT_FOUND,
      });
    });
  });

  describe('resume()', () => {
    it('emits identity.resumed event before throwing', async () => {
      const listener = vi.fn();
      events.on('identity.resumed', listener);

      await expect(identity.resume('inv_id_123')).rejects.toThrow(
        InvarianceError,
      );

      // Known behavior: event emitted before throw (PR #5 fixes this)
      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith({ identityId: 'inv_id_123' });
    });

    it('throws InvarianceError with IDENTITY_NOT_FOUND', async () => {
      await expect(identity.resume('inv_id_123')).rejects.toMatchObject({
        code: ErrorCode.IDENTITY_NOT_FOUND,
      });
    });
  });

  describe('deactivate()', () => {
    it('throws InvarianceError with IDENTITY_NOT_FOUND', async () => {
      await expect(identity.deactivate('inv_id_123')).rejects.toThrow(
        InvarianceError,
      );
      await expect(identity.deactivate('inv_id_123')).rejects.toMatchObject({
        code: ErrorCode.IDENTITY_NOT_FOUND,
      });
    });
  });

  describe('list()', () => {
    it('returns empty array', async () => {
      const result = await identity.list();
      expect(result).toEqual([]);
    });

    it('returns empty array with filters', async () => {
      const result = await identity.list({ type: 'agent', status: 'active' });
      expect(result).toEqual([]);
    });
  });

  describe('attestations()', () => {
    it('returns empty array', async () => {
      const result = await identity.attestations('inv_id_123');
      expect(result).toEqual([]);
    });
  });
});
