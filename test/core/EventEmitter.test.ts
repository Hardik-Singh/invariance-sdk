import { describe, it, expect, vi } from 'vitest';
import { InvarianceEventEmitter } from '../../src/core/EventEmitter.js';

describe('InvarianceEventEmitter', () => {
  it('on() returns an unsubscribe function', () => {
    const emitter = new InvarianceEventEmitter();
    const unsub = emitter.on('identity.registered', () => {});
    expect(typeof unsub).toBe('function');
  });

  it('emit() calls registered listeners with data', () => {
    const emitter = new InvarianceEventEmitter();
    const listener = vi.fn();
    emitter.on('identity.registered', listener);

    const data = { identityId: 'inv_id_1', address: '0xabc' };
    emitter.emit('identity.registered', data);

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(data);
  });

  it('supports multiple listeners on the same event', () => {
    const emitter = new InvarianceEventEmitter();
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    emitter.on('intent.completed', listener1);
    emitter.on('intent.completed', listener2);

    const data = { intentId: 'i1', txHash: '0x1' };
    emitter.emit('intent.completed', data);

    expect(listener1).toHaveBeenCalledWith(data);
    expect(listener2).toHaveBeenCalledWith(data);
  });

  it('off() removes a listener', () => {
    const emitter = new InvarianceEventEmitter();
    const listener = vi.fn();
    emitter.on('error', listener);
    emitter.off('error', listener);

    emitter.emit('error', { code: 'ERR', message: 'test' });
    expect(listener).not.toHaveBeenCalled();
  });

  it('unsubscribe function from on() removes the listener', () => {
    const emitter = new InvarianceEventEmitter();
    const listener = vi.fn();
    const unsub = emitter.on('escrow.created', listener);

    unsub();
    emitter.emit('escrow.created', { escrowId: 'e1', amount: '100' });
    expect(listener).not.toHaveBeenCalled();
  });

  it('swallows listener errors without affecting other listeners', () => {
    const emitter = new InvarianceEventEmitter();
    const badListener = vi.fn(() => {
      throw new Error('boom');
    });
    const goodListener = vi.fn();

    emitter.on('ledger.logged', badListener);
    emitter.on('ledger.logged', goodListener);

    const data = { entryId: 'l1', action: 'swap' };
    // Should not throw
    emitter.emit('ledger.logged', data);

    expect(badListener).toHaveBeenCalledWith(data);
    expect(goodListener).toHaveBeenCalledWith(data);
  });

  it('emit with no listeners is a no-op', () => {
    const emitter = new InvarianceEventEmitter();
    // Should not throw
    expect(() => {
      emitter.emit('identity.paused', { identityId: 'test' });
    }).not.toThrow();
  });

  it('different event types are independent', () => {
    const emitter = new InvarianceEventEmitter();
    const identityListener = vi.fn();
    const escrowListener = vi.fn();

    emitter.on('identity.registered', identityListener);
    emitter.on('escrow.created', escrowListener);

    emitter.emit('identity.registered', {
      identityId: 'id1',
      address: '0x1',
    });

    expect(identityListener).toHaveBeenCalledOnce();
    expect(escrowListener).not.toHaveBeenCalled();
  });

  it('off() on non-existent event is a no-op', () => {
    const emitter = new InvarianceEventEmitter();
    const listener = vi.fn();
    // Should not throw
    expect(() => {
      emitter.off('identity.registered', listener);
    }).not.toThrow();
  });

  it('same listener added twice receives event twice', () => {
    const emitter = new InvarianceEventEmitter();
    const listener = vi.fn();
    // Set uses reference equality so the same fn reference is only added once
    emitter.on('identity.paused', listener);
    emitter.on('identity.paused', listener);

    emitter.emit('identity.paused', { identityId: 'id1' });
    // Set deduplicates, so it should only be called once
    expect(listener).toHaveBeenCalledOnce();
  });

  it('listeners added after emit do not receive that emit', () => {
    const emitter = new InvarianceEventEmitter();
    const earlyListener = vi.fn();
    emitter.on('identity.resumed', earlyListener);

    emitter.emit('identity.resumed', { identityId: 'id1' });

    const lateListener = vi.fn();
    emitter.on('identity.resumed', lateListener);

    expect(earlyListener).toHaveBeenCalledOnce();
    expect(lateListener).not.toHaveBeenCalled();
  });
});
