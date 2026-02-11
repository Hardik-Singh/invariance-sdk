import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ErrorCode } from '@invariance/common';
import { WalletManager } from '../../src/modules/wallet/WalletManager.js';
import { InvarianceError } from '../../src/errors/InvarianceError.js';
import {
  createContractFactory,
  createEventEmitter,
  createTelemetry,
} from '../fixtures/mocks.js';
import type { Telemetry } from '../../src/core/Telemetry.js';
import type { ContractFactory } from '../../src/core/ContractFactory.js';
import { baseSepolia } from 'viem/chains';

describe('WalletManager', () => {
  let factory: ContractFactory;
  let telemetry: Telemetry;
  let wallet: WalletManager;

  beforeEach(() => {
    factory = createContractFactory();
    telemetry = createTelemetry();
    wallet = new WalletManager(factory, createEventEmitter(), telemetry);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initFromSigner()', () => {
    it('initializes from viem Account signer', async () => {
      const mockAccount = {
        address: '0x1111111111111111111111111111111111111111' as `0x${string}`,
        signMessage: vi.fn(),
        signTransaction: vi.fn(),
        signTypedData: vi.fn(),
        type: 'local' as const,
        source: 'custom',
        publicKey: '0x04' as `0x${string}`,
      };

      await wallet.initFromSigner(mockAccount, 'https://rpc.example.com', baseSepolia);

      expect(wallet.isConnected()).toBe(true);
      expect(wallet.getAddress()).toBe('0x1111111111111111111111111111111111111111');
    });

    it('initializes from WalletClient signer', async () => {
      const mockWalletClient = {
        transport: {},
        getAddresses: vi.fn().mockResolvedValue(['0x2222222222222222222222222222222222222222'] as `0x${string}`[]),
        chain: baseSepolia,
      };

      await wallet.initFromSigner(mockWalletClient, 'https://rpc.example.com', baseSepolia);

      expect(wallet.isConnected()).toBe(true);
      expect(wallet.getAddress()).toBe('0x2222222222222222222222222222222222222222');
    });

    it('initializes from EIP-1193 provider', async () => {
      const mockProvider = {
        request: vi.fn().mockResolvedValue(['0x3333333333333333333333333333333333333333']),
      };

      await wallet.initFromSigner(mockProvider, 'https://rpc.example.com', baseSepolia);

      expect(wallet.isConnected()).toBe(true);
      expect(wallet.getAddress()).toBe('0x3333333333333333333333333333333333333333');
    });

    it('throws for unrecognized signer type', async () => {
      await expect(
        wallet.initFromSigner({}, 'https://rpc.example.com', baseSepolia),
      ).rejects.toThrow(InvarianceError);
    });

    it('throws when WalletClient has no addresses', async () => {
      const mockWalletClient = {
        transport: {},
        getAddresses: vi.fn().mockResolvedValue([]),
        chain: baseSepolia,
      };

      await expect(
        wallet.initFromSigner(mockWalletClient, 'https://rpc.example.com', baseSepolia),
      ).rejects.toThrow('no addresses');
    });
  });

  describe('get()', () => {
    it('returns wallet info when connected', async () => {
      const mockAccount = {
        address: '0x1111111111111111111111111111111111111111' as `0x${string}`,
        signMessage: vi.fn(),
        signTransaction: vi.fn(),
        signTypedData: vi.fn(),
        type: 'local' as const,
        source: 'custom',
        publicKey: '0x04' as `0x${string}`,
      };
      await wallet.initFromSigner(mockAccount, 'https://rpc.example.com', baseSepolia);

      const info = await wallet.get();

      expect(info.address).toBe('0x1111111111111111111111111111111111111111');
      expect(info.connected).toBe(true);
      expect(info.provider).toBe('raw');
    });

    it('throws when not connected', async () => {
      await expect(wallet.get()).rejects.toThrow(InvarianceError);
    });
  });

  describe('balance()', () => {
    it('returns ETH balance from public client', async () => {
      const mockAccount = {
        address: '0x1111111111111111111111111111111111111111' as `0x${string}`,
        signMessage: vi.fn(),
        signTransaction: vi.fn(),
        signTypedData: vi.fn(),
        type: 'local' as const,
        source: 'custom',
        publicKey: '0x04' as `0x${string}`,
      };
      await wallet.initFromSigner(mockAccount, 'https://rpc.example.com', baseSepolia);

      // Mock the public client's getBalance
      const pc = wallet.getPublicClient();
      vi.spyOn(pc, 'getBalance').mockResolvedValue(2000000000000000000n); // 2 ETH

      const result = await wallet.balance();

      expect(result.eth).toBe('2');
      expect(result.address).toBe('0x1111111111111111111111111111111111111111');
    });
  });

  describe('isConnected()', () => {
    it('returns false when not initialized', () => {
      expect(wallet.isConnected()).toBe(false);
    });
  });

  describe('create()', () => {
    it('throws not supported error', async () => {
      await expect(wallet.create()).rejects.toThrow(InvarianceError);
    });
  });

  describe('connect()', () => {
    it('throws not supported error', async () => {
      await expect(wallet.connect()).rejects.toThrow(InvarianceError);
    });
  });

  describe('export()', () => {
    it('throws not supported error', async () => {
      await expect(wallet.export()).rejects.toThrow(InvarianceError);
    });
  });

  describe('telemetry', () => {
    it('tracks method calls', async () => {
      const trackSpy = vi.spyOn(telemetry, 'track');
      try { await wallet.create(); } catch { /* expected */ }
      expect(trackSpy).toHaveBeenCalledWith('wallet.create');
    });
  });
});
