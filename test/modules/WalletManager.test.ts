import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { InvarianceConfig } from '@invariance/common';
import { ErrorCode } from '@invariance/common';
import { WalletManager } from '../../src/modules/wallet/WalletManager.js';
import { InvarianceError } from '../../src/errors/InvarianceError.js';
import {
  createContractFactory,
  createTelemetry,
  createMockContract,
  BASE_SEPOLIA_CONFIG,
} from '../fixtures/mocks.js';
import type { Telemetry } from '../../src/core/Telemetry.js';
import type { ContractFactory } from '../../src/core/ContractFactory.js';
import { baseSepolia } from 'viem/chains';

describe('WalletManager', () => {
  let factory: ContractFactory;
  let telemetry: Telemetry;
  let wallet: WalletManager;
  let config: InvarianceConfig;

  beforeEach(() => {
    config = { ...BASE_SEPOLIA_CONFIG };
    factory = createContractFactory();
    telemetry = createTelemetry();
    wallet = new WalletManager(factory, telemetry, config);
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

    it('returns both USDC and ETH balances when USDC contract is available', async () => {
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

      // Mock USDC contract balanceOf
      const mockContract = createMockContract({
        read: {
          balanceOf: vi.fn().mockResolvedValue(100500000n), // 100.50 USDC
        },
      });
      vi.spyOn(factory, 'getContract').mockReturnValue(mockContract as ReturnType<ContractFactory['getContract']>);

      const result = await wallet.balance();

      expect(result.eth).toBe('2');
      expect(result.usdc).toBe('100.500000');
      expect(result.address).toBe('0x1111111111111111111111111111111111111111');
    });
  });

  describe('isConnected()', () => {
    it('returns false when not initialized', () => {
      expect(wallet.isConnected()).toBe(false);
    });
  });

  describe('create()', () => {
    it('throws error when Privy config is missing', async () => {
      await expect(wallet.create()).rejects.toThrow('Privy config');
    });

    it('throws error when @privy-io/server-auth is not installed', async () => {
      config.privy = { appId: 'test-app-id', appSecret: 'test-secret' };
      wallet = new WalletManager(factory, telemetry, config);

      await expect(wallet.create()).rejects.toThrow('@privy-io/server-auth');
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

  describe('Privy wallet detection', () => {
    it('detects Privy wallet with _privy property', async () => {
      const mockPrivyProvider = {
        _privy: { /* privy internals */ },
        request: vi.fn().mockResolvedValue(['0x4444444444444444444444444444444444444444']),
      };

      await wallet.initFromSigner(mockPrivyProvider, 'https://rpc.example.com', baseSepolia);

      const info = await wallet.get();
      expect(info.provider).toBe('privy');
      expect(wallet.isConnected()).toBe(true);
    });

    it('detects Privy wallet with isPrivy property', async () => {
      const mockPrivyProvider = {
        isPrivy: true,
        request: vi.fn().mockResolvedValue(['0x5555555555555555555555555555555555555555']),
      };

      await wallet.initFromSigner(mockPrivyProvider, 'https://rpc.example.com', baseSepolia);

      const info = await wallet.get();
      expect(info.provider).toBe('privy');
    });

    it('detects Privy wallet with privy property', async () => {
      const mockPrivyProvider = {
        privy: { appId: 'test' },
        request: vi.fn().mockResolvedValue(['0x6666666666666666666666666666666666666666']),
      };

      await wallet.initFromSigner(mockPrivyProvider, 'https://rpc.example.com', baseSepolia);

      const info = await wallet.get();
      expect(info.provider).toBe('privy');
    });
  });

  describe('fund()', () => {
    it('throws error when wallet is not connected', async () => {
      await expect(
        wallet.fund('0x1111111111111111111111111111111111111111', { amount: '100' }),
      ).rejects.toThrow('No wallet connected');
    });

    it('tracks telemetry for USDC transfers', async () => {
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

      const trackSpy = vi.spyOn(telemetry, 'track');

      // Mock USDC contract transfer
      const mockContract = createMockContract({
        write: {
          transfer: vi.fn().mockResolvedValue('0xtxhash'),
        },
      });
      vi.spyOn(factory, 'getContract').mockReturnValue(mockContract as ReturnType<ContractFactory['getContract']>);

      // Mock waitForReceipt - need to mock the public client
      const pc = wallet.getPublicClient();
      vi.spyOn(pc, 'waitForTransactionReceipt').mockResolvedValue({
        transactionHash: '0xtxhash' as `0x${string}`,
        blockNumber: 100n,
        gasUsed: 21000n,
        status: 'success',
        logs: [],
      } as any);

      try {
        await wallet.fund('0x2222222222222222222222222222222222222222', { amount: '100.50' });
      } catch {
        // May fail due to mocking, but telemetry should be called
      }

      expect(trackSpy).toHaveBeenCalledWith('wallet.fund', { token: 'USDC' });
    });
  });
});
