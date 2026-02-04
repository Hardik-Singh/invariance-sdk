import { describe, it, expect } from 'vitest';
import { Invariance } from '../src/client.js';
import { SpendingCap } from '../src/permissions/spending-cap.js';
import { TimeWindow } from '../src/permissions/time-window.js';
import { ActionWhitelist } from '../src/permissions/action-whitelist.js';

describe('Invariance Client', () => {
  describe('initialization', () => {
    it('should throw for unsupported chain ID', () => {
      expect(() => {
        new Invariance({
          chainId: 1, // Ethereum mainnet - not supported
          rpcUrl: 'https://eth.example.com',
        });
      }).toThrow('Unsupported chain ID: 1');
    });

    it('should accept Base mainnet', () => {
      const inv = new Invariance({
        chainId: 8453,
        rpcUrl: 'https://mainnet.base.org',
      });
      expect(inv.getChainConfig()?.name).toBe('Base');
    });

    it('should accept Base Sepolia', () => {
      const inv = new Invariance({
        chainId: 84532,
        rpcUrl: 'https://sepolia.base.org',
      });
      expect(inv.getChainConfig()?.name).toBe('Base Sepolia');
    });
  });

  describe('permission checking', () => {
    it('should allow actions when no permissions configured', () => {
      const inv = new Invariance({
        chainId: 8453,
        rpcUrl: 'https://mainnet.base.org',
      });

      const allowed = inv.checkPermission({
        type: 'any-action',
        params: {},
      });

      expect(allowed).toBe(true);
    });
  });
});

describe('SpendingCap', () => {
  it('should allow actions under the cap', () => {
    const cap = new SpendingCap({
      maxPerTx: 1000000000000000000n, // 1 ETH
      maxPerDay: 5000000000000000000n, // 5 ETH
    });

    const result = cap.check({
      type: 'transfer',
      params: { amount: '500000000000000000' }, // 0.5 ETH
    });

    expect(result.allowed).toBe(true);
  });

  it('should deny actions over per-tx cap', () => {
    const cap = new SpendingCap({
      maxPerTx: 1000000000000000000n, // 1 ETH
      maxPerDay: 5000000000000000000n, // 5 ETH
    });

    const result = cap.check({
      type: 'transfer',
      params: { amount: '2000000000000000000' }, // 2 ETH
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('exceeds per-tx limit');
  });

  it('should track daily spending', () => {
    const cap = new SpendingCap({
      maxPerTx: 1000000000000000000n, // 1 ETH
      maxPerDay: 2000000000000000000n, // 2 ETH
    });

    // Record 1.5 ETH spent
    cap.recordSpent(1500000000000000000n);

    // Try to spend 1 ETH more (would exceed daily limit)
    const result = cap.check({
      type: 'transfer',
      params: { amount: '1000000000000000000' },
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('exceed limit');
  });
});

describe('TimeWindow', () => {
  it('should validate hour range', () => {
    expect(() => {
      new TimeWindow({ startHour: -1, endHour: 12 });
    }).toThrow('startHour must be between 0 and 23');

    expect(() => {
      new TimeWindow({ startHour: 9, endHour: 25 });
    }).toThrow('endHour must be between 0 and 23');
  });

  it('should validate day range', () => {
    expect(() => {
      new TimeWindow({
        startHour: 9,
        endHour: 17,
        allowedDays: [7], // Invalid day
      });
    }).toThrow('allowedDays must contain values between 0 and 6');
  });

  it('should convert to permission config', () => {
    const window = new TimeWindow({
      startHour: 9,
      endHour: 17,
      allowedDays: [1, 2, 3, 4, 5],
    });

    const permission = window.toPermission();

    expect(permission.type).toBe('time-window');
    expect(permission.startHour).toBe(9);
    expect(permission.endHour).toBe(17);
    expect(permission.allowedDays).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('ActionWhitelist', () => {
  it('should throw for empty whitelist', () => {
    expect(() => {
      new ActionWhitelist({ allowedActions: [] });
    }).toThrow('allowedActions must not be empty');
  });

  it('should allow exact matches', () => {
    const whitelist = new ActionWhitelist({
      allowedActions: ['transfer', 'read'],
    });

    expect(whitelist.check({ type: 'transfer', params: {} }).allowed).toBe(true);
    expect(whitelist.check({ type: 'read', params: {} }).allowed).toBe(true);
    expect(whitelist.check({ type: 'delete', params: {} }).allowed).toBe(false);
  });

  it('should support wildcard suffix', () => {
    const whitelist = new ActionWhitelist({
      allowedActions: ['read:*'],
    });

    expect(whitelist.check({ type: 'read:balance', params: {} }).allowed).toBe(true);
    expect(whitelist.check({ type: 'read:history', params: {} }).allowed).toBe(true);
    expect(whitelist.check({ type: 'read', params: {} }).allowed).toBe(false);
    expect(whitelist.check({ type: 'write:data', params: {} }).allowed).toBe(false);
  });

  it('should support wildcard only', () => {
    const whitelist = new ActionWhitelist({
      allowedActions: ['*'],
    });

    expect(whitelist.check({ type: 'anything', params: {} }).allowed).toBe(true);
    expect(whitelist.check({ type: 'really:anything', params: {} }).allowed).toBe(true);
  });

  it('should allow adding and removing actions', () => {
    const whitelist = new ActionWhitelist({
      allowedActions: ['transfer'],
    });

    whitelist.addAction('read');
    expect(whitelist.getAllowedActions()).toContain('read');

    whitelist.removeAction('transfer');
    expect(whitelist.getAllowedActions()).not.toContain('transfer');
  });
});
