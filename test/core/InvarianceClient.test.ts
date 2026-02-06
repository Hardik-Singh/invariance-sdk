import { describe, it, expect, vi } from 'vitest';
import { Invariance, SDK_VERSION } from '../../src/core/InvarianceClient.js';
import { IdentityManager } from '../../src/modules/identity/IdentityManager.js';
import { IntentProtocol } from '../../src/modules/intent/IntentProtocol.js';
import { PolicyEngine } from '../../src/modules/policy/PolicyEngine.js';
import { EscrowManager } from '../../src/modules/escrow/EscrowManager.js';
import { EventLedger } from '../../src/modules/ledger/EventLedger.js';
import { ReputationEngine } from '../../src/modules/reputation/ReputationEngine.js';
import { MarketplaceKit } from '../../src/modules/marketplace/MarketplaceKit.js';
import { GasManager } from '../../src/modules/gas/GasManager.js';
import { WebhookManager } from '../../src/modules/webhooks/WebhookManager.js';
import { WalletManager } from '../../src/modules/wallet/WalletManager.js';
import { BASE_SEPOLIA_CONFIG, BASE_CONFIG } from '../fixtures/mocks.js';

describe('Invariance (Client)', () => {
  describe('constructor', () => {
    it('accepts base-sepolia config without error', () => {
      expect(() => new Invariance(BASE_SEPOLIA_CONFIG)).not.toThrow();
    });

    it('accepts base config without error', () => {
      expect(() => new Invariance(BASE_CONFIG)).not.toThrow();
    });
  });

  describe('version', () => {
    it('returns SDK_VERSION', () => {
      const inv = new Invariance(BASE_SEPOLIA_CONFIG);
      expect(inv.version).toBe(SDK_VERSION);
    });

    it('SDK_VERSION is a semver string', () => {
      expect(SDK_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('getConfig()', () => {
    it('returns the provided config', () => {
      const inv = new Invariance(BASE_SEPOLIA_CONFIG);
      expect(inv.getConfig()).toBe(BASE_SEPOLIA_CONFIG);
    });
  });

  describe('getChainConfig()', () => {
    it('returns chain config from ContractFactory', () => {
      const inv = new Invariance(BASE_SEPOLIA_CONFIG);
      const config = inv.getChainConfig();
      expect(config.id).toBe(84532);
      expect(config.name).toBe('Base Sepolia');
    });
  });

  describe('getContractAddresses()', () => {
    it('returns addresses object', () => {
      const inv = new Invariance(BASE_SEPOLIA_CONFIG);
      const addrs = inv.getContractAddresses();
      expect(addrs).toHaveProperty('identity');
      expect(addrs).toHaveProperty('policy');
      expect(addrs).toHaveProperty('escrow');
    });
  });

  describe('getExplorerBaseUrl()', () => {
    it('returns default explorer URL', () => {
      const inv = new Invariance(BASE_SEPOLIA_CONFIG);
      expect(inv.getExplorerBaseUrl()).toBe(
        'https://verify.useinvariance.com',
      );
    });

    it('returns custom explorer URL when configured', () => {
      const inv = new Invariance({
        ...BASE_SEPOLIA_CONFIG,
        explorerBaseUrl: 'https://custom.explorer',
      });
      expect(inv.getExplorerBaseUrl()).toBe('https://custom.explorer');
    });
  });

  describe('module lazy initialization', () => {
    it('identity getter returns IdentityManager', () => {
      const inv = new Invariance(BASE_SEPOLIA_CONFIG);
      expect(inv.identity).toBeInstanceOf(IdentityManager);
    });

    it('identity getter returns same instance on repeated access', () => {
      const inv = new Invariance(BASE_SEPOLIA_CONFIG);
      const first = inv.identity;
      const second = inv.identity;
      expect(first).toBe(second);
    });

    it('wallet getter returns WalletManager', () => {
      const inv = new Invariance(BASE_SEPOLIA_CONFIG);
      expect(inv.wallet).toBeInstanceOf(WalletManager);
    });

    it('intent getter returns IntentProtocol', () => {
      const inv = new Invariance(BASE_SEPOLIA_CONFIG);
      expect(inv.intent).toBeInstanceOf(IntentProtocol);
    });

    it('policy getter returns PolicyEngine', () => {
      const inv = new Invariance(BASE_SEPOLIA_CONFIG);
      expect(inv.policy).toBeInstanceOf(PolicyEngine);
    });

    it('escrow getter returns EscrowManager', () => {
      const inv = new Invariance(BASE_SEPOLIA_CONFIG);
      expect(inv.escrow).toBeInstanceOf(EscrowManager);
    });

    it('ledger getter returns EventLedger', () => {
      const inv = new Invariance(BASE_SEPOLIA_CONFIG);
      expect(inv.ledger).toBeInstanceOf(EventLedger);
    });

    it('verify getter returns a callable function', () => {
      const inv = new Invariance(BASE_SEPOLIA_CONFIG);
      expect(typeof inv.verify).toBe('function');
    });

    it('reputation getter returns ReputationEngine', () => {
      const inv = new Invariance(BASE_SEPOLIA_CONFIG);
      expect(inv.reputation).toBeInstanceOf(ReputationEngine);
    });

    it('marketplace getter returns MarketplaceKit', () => {
      const inv = new Invariance(BASE_SEPOLIA_CONFIG);
      expect(inv.marketplace).toBeInstanceOf(MarketplaceKit);
    });

    it('gas getter returns GasManager', () => {
      const inv = new Invariance(BASE_SEPOLIA_CONFIG);
      expect(inv.gas).toBeInstanceOf(GasManager);
    });

    it('webhooks getter returns WebhookManager', () => {
      const inv = new Invariance(BASE_SEPOLIA_CONFIG);
      expect(inv.webhooks).toBeInstanceOf(WebhookManager);
    });
  });

  describe('on()', () => {
    it('subscribes to events and returns unsubscribe', () => {
      const inv = new Invariance(BASE_SEPOLIA_CONFIG);
      const listener = vi.fn();
      const unsub = inv.on('identity.registered', listener);

      expect(typeof unsub).toBe('function');
    });

    it('listener receives emitted events from modules', async () => {
      const inv = new Invariance(BASE_SEPOLIA_CONFIG);
      const listener = vi.fn();
      inv.on('identity.registered', listener);

      // Trigger via identity.register which emits 'identity.registered'
      await inv.identity.register({
        type: 'agent',
        owner: '0xDev',
        label: 'TestBot',
      });

      expect(listener).toHaveBeenCalledOnce();
      expect(listener.mock.calls[0][0]).toHaveProperty('identityId');
      expect(listener.mock.calls[0][0]).toHaveProperty('address');
    });

    it('unsubscribe stops further notifications', async () => {
      const inv = new Invariance(BASE_SEPOLIA_CONFIG);
      const listener = vi.fn();
      const unsub = inv.on('identity.registered', listener);
      unsub();

      await inv.identity.register({
        type: 'agent',
        owner: '0xDev',
        label: 'TestBot',
      });

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('ensureWalletInit()', () => {
    it('resolves immediately when no signer provided', async () => {
      const inv = new Invariance(BASE_SEPOLIA_CONFIG);
      await expect(inv.ensureWalletInit()).resolves.toBeUndefined();
    });
  });
});
