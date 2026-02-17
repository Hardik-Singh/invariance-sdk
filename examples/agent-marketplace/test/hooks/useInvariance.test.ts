/**
 * Test suite for useInvariance hook (Agent Marketplace)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { Invariance } from '@invariance/sdk';
import type { BalanceInfo, EIP1193Provider, WalletInfo } from '@invariance/sdk';
import { useInvariance } from '@/hooks/useInvariance';
import * as invarianceModule from '@/lib/invariance';

vi.mock('@/lib/invariance', () => {
  let instance: Invariance | null = null;

  return {
    getInvariance: vi.fn((provider?: EIP1193Provider) => {
      if (provider) {
        instance = new Invariance({
          chain: 'base-sepolia',
          rpcUrl: 'https://sepolia.base.org',
          signer: provider,
        });
      } else if (!instance) {
        instance = new Invariance({
          chain: 'base-sepolia',
          rpcUrl: 'https://sepolia.base.org',
        });
      }
      return instance;
    }),
    resetInvariance: vi.fn(() => {
      instance = null;
    }),
  };
});

type EthereumRequest = (args: { method: string }) => Promise<unknown>;
type MockEthereum = { request: ReturnType<typeof vi.fn<EthereumRequest>> };

const walletInfo: WalletInfo = {
  address: '0x1234567890123456789012345678901234567890',
  chainId: 84532,
  network: 'base-sepolia',
};

const balanceInfo: BalanceInfo = {
  usdc: '1000.50',
  eth: '0.5',
  address: walletInfo.address,
};

describe('useInvariance (Agent Marketplace)', () => {
  let mockEthereum: MockEthereum;

  beforeEach(() => {
    vi.clearAllMocks();

    mockEthereum = {
      request: vi.fn(async ({ method }: { method: string }) => {
        if (method === 'eth_accounts') return [];
        return null;
      }),
    };

    Object.defineProperty(window, 'ethereum', {
      writable: true,
      configurable: true,
      value: mockEthereum as unknown as EIP1193Provider,
    });
  });

  it('should initialize with SDK instance and not connected', () => {
    const { result } = renderHook(() => useInvariance());

    expect(result.current.inv).toBeInstanceOf(Invariance);
    expect(result.current.isConnected).toBe(false);
    expect(result.current.address).toBeNull();
    expect(result.current.balance).toBeNull();
    expect(result.current.walletInfo).toBeNull();
    expect(result.current.connecting).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should provide connect and disconnect functions', () => {
    const { result } = renderHook(() => useInvariance());
    expect(typeof result.current.connect).toBe('function');
    expect(typeof result.current.disconnect).toBe('function');
  });

  it('should connect wallet successfully', async () => {
    const { result } = renderHook(() => useInvariance());
    const client = result.current.inv;

    vi.mocked(invarianceModule.getInvariance).mockReturnValue(client);
    vi.spyOn(client, 'ensureWalletInit').mockResolvedValue(undefined);
    vi.spyOn(client.wallet, 'get').mockResolvedValue(walletInfo);
    vi.spyOn(client.wallet, 'balance').mockResolvedValue(balanceInfo);

    await act(async () => {
      await result.current.connect();
    });

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    expect(result.current.address).toBe(walletInfo.address);
    expect(result.current.balance).toEqual(balanceInfo);
    expect(result.current.walletInfo).toEqual(walletInfo);
    expect(result.current.error).toBeNull();
  });

  it('should set connecting state during connection', async () => {
    const { result } = renderHook(() => useInvariance());
    const client = result.current.inv;
    let resolveInit: (() => void) | null = null;
    const initPromise = new Promise<void>((resolve) => {
      resolveInit = resolve;
    });

    vi.mocked(invarianceModule.getInvariance).mockReturnValue(client);
    vi.spyOn(client, 'ensureWalletInit').mockReturnValue(initPromise);
    vi.spyOn(client.wallet, 'get').mockResolvedValue(walletInfo);
    vi.spyOn(client.wallet, 'balance').mockResolvedValue(balanceInfo);

    act(() => {
      void result.current.connect();
    });

    await waitFor(() => {
      expect(result.current.connecting).toBe(true);
    });

    resolveInit?.();

    await waitFor(() => {
      expect(result.current.connecting).toBe(false);
    });
  });

  it('should handle missing wallet error', async () => {
    Object.defineProperty(window, 'ethereum', {
      writable: true,
      configurable: true,
      value: undefined,
    });

    const { result } = renderHook(() => useInvariance());

    await act(async () => {
      await result.current.connect();
    });

    await waitFor(() => {
      expect(result.current.error).toContain('No wallet detected');
    });

    expect(result.current.isConnected).toBe(false);
  });

  it('should fetch balance after connection', async () => {
    const { result } = renderHook(() => useInvariance());
    const client = result.current.inv;
    const mockBalance: BalanceInfo = {
      usdc: '2500.00',
      eth: '1.25',
      address: walletInfo.address,
    };

    vi.mocked(invarianceModule.getInvariance).mockReturnValue(client);
    vi.spyOn(client, 'ensureWalletInit').mockResolvedValue(undefined);
    vi.spyOn(client.wallet, 'get').mockResolvedValue(walletInfo);
    vi.spyOn(client.wallet, 'balance').mockResolvedValue(mockBalance);

    await act(async () => {
      await result.current.connect();
    });

    await waitFor(() => {
      expect(result.current.balance).toEqual(mockBalance);
    });
  });

  it('should handle balance fetch errors gracefully', async () => {
    const { result } = renderHook(() => useInvariance());
    const client = result.current.inv;

    vi.mocked(invarianceModule.getInvariance).mockReturnValue(client);
    vi.spyOn(client, 'ensureWalletInit').mockResolvedValue(undefined);
    vi.spyOn(client.wallet, 'get').mockResolvedValue(walletInfo);
    vi.spyOn(client.wallet, 'balance').mockRejectedValue(new Error('Balance fetch failed'));

    await act(async () => {
      await result.current.connect();
    });

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    expect(result.current.balance).toEqual({
      usdc: '0.00',
      eth: '0.00',
      address: walletInfo.address,
    });
  });

  it('should disconnect wallet', async () => {
    const { result } = renderHook(() => useInvariance());
    const client = result.current.inv;

    vi.mocked(invarianceModule.getInvariance).mockReturnValue(client);
    vi.spyOn(client, 'ensureWalletInit').mockResolvedValue(undefined);
    vi.spyOn(client.wallet, 'get').mockResolvedValue(walletInfo);
    vi.spyOn(client.wallet, 'balance').mockResolvedValue(balanceInfo);

    await act(async () => {
      await result.current.connect();
    });

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    act(() => {
      result.current.disconnect();
    });

    await waitFor(() => {
      expect(result.current.isConnected).toBe(false);
    });

    expect(result.current.address).toBeNull();
    expect(result.current.balance).toBeNull();
    expect(result.current.walletInfo).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('should reset SDK instance on disconnect', () => {
    const { result } = renderHook(() => useInvariance());

    act(() => {
      result.current.disconnect();
    });

    expect(invarianceModule.resetInvariance).toHaveBeenCalled();
  });

  it('should handle connection errors', async () => {
    const { result } = renderHook(() => useInvariance());

    vi.mocked(invarianceModule.getInvariance).mockImplementationOnce(() => {
      throw new Error('User denied connection');
    });

    await act(async () => {
      await result.current.connect();
    });

    await waitFor(() => {
      expect(result.current.error).toBe('User denied connection');
    });

    expect(result.current.isConnected).toBe(false);
    expect(result.current.connecting).toBe(false);
  });

  it('should attempt auto-connect on mount if wallet was previously connected', async () => {
    mockEthereum.request.mockImplementation(async ({ method }: { method: string }) => {
      if (method === 'eth_accounts') return [walletInfo.address];
      return null;
    });

    const { result } = renderHook(() => useInvariance());
    const client = result.current.inv;

    vi.mocked(invarianceModule.getInvariance).mockReturnValue(client);
    vi.spyOn(client, 'ensureWalletInit').mockResolvedValue(undefined);
    vi.spyOn(client.wallet, 'get').mockResolvedValue(walletInfo);
    vi.spyOn(client.wallet, 'balance').mockResolvedValue(balanceInfo);

    await waitFor(() => {
      expect(mockEthereum.request).toHaveBeenCalledWith({ method: 'eth_accounts' });
    });
  });

  it('should handle auto-connect errors silently', async () => {
    mockEthereum.request.mockImplementation(async ({ method }: { method: string }) => {
      if (method === 'eth_accounts') throw new Error('Failed to get accounts');
      return null;
    });

    const { result } = renderHook(() => useInvariance());

    await waitFor(() => {
      expect(result.current.isConnected).toBe(false);
    });

    expect(result.current.error).toBeNull();
  });

  it('should provide read-only SDK instance before connection', () => {
    const { result } = renderHook(() => useInvariance());
    expect(result.current.inv).toBeInstanceOf(Invariance);
    expect(result.current.isConnected).toBe(false);
  });

  it('should clear error on successful connection after previous error', async () => {
    const { result } = renderHook(() => useInvariance());
    const client = result.current.inv;

    vi.mocked(invarianceModule.getInvariance).mockReturnValue(client);
    vi.spyOn(client, 'ensureWalletInit')
      .mockRejectedValueOnce(new Error('First attempt failed'))
      .mockResolvedValueOnce(undefined);
    vi.spyOn(client.wallet, 'get').mockResolvedValue(walletInfo);
    vi.spyOn(client.wallet, 'balance').mockResolvedValue(balanceInfo);

    await act(async () => {
      await result.current.connect();
    });

    await waitFor(() => {
      expect(result.current.error).toBe('First attempt failed');
    });

    await act(async () => {
      await result.current.connect();
    });

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    expect(result.current.error).toBeNull();
  });

  it('should update SDK instance after connection', async () => {
    const readonlyClient = new Invariance({
      chain: 'base-sepolia',
      rpcUrl: 'https://sepolia.base.org',
    });
    const connectedClient = new Invariance({
      chain: 'base-sepolia',
      rpcUrl: 'https://sepolia.base.org',
      signer: mockEthereum as unknown as EIP1193Provider,
    });

    vi.mocked(invarianceModule.getInvariance).mockImplementation((provider?: EIP1193Provider) => {
      return provider ? connectedClient : readonlyClient;
    });

    const { result } = renderHook(() => useInvariance());

    vi.spyOn(connectedClient, 'ensureWalletInit').mockResolvedValue(undefined);
    vi.spyOn(connectedClient.wallet, 'get').mockResolvedValue(walletInfo);
    vi.spyOn(connectedClient.wallet, 'balance').mockResolvedValue(balanceInfo);

    await act(async () => {
      await result.current.connect();
    });

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    expect(result.current.inv).toBe(connectedClient);
  });

  it('should handle wallet initialization errors', async () => {
    const { result } = renderHook(() => useInvariance());
    const client = result.current.inv;

    vi.mocked(invarianceModule.getInvariance).mockReturnValue(client);
    vi.spyOn(client, 'ensureWalletInit').mockRejectedValue(
      new Error('Wallet initialization failed'),
    );

    await act(async () => {
      await result.current.connect();
    });

    await waitFor(() => {
      expect(result.current.error).toBe('Wallet initialization failed');
    });

    expect(result.current.isConnected).toBe(false);
  });
});
