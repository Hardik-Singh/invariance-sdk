/**
 * Test suite for useInvariance hook (Agent Marketplace)
 *
 * Tests wallet connection, SDK initialization, balance fetching,
 * and disconnect functionality for the Agent Marketplace example.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useInvariance } from '@/hooks/useInvariance';
import { Invariance } from '@invariance/sdk';

// Mock the lib/invariance module
vi.mock('@/lib/invariance', () => {
  let instance: Invariance | null = null;

  return {
    getInvariance: vi.fn((provider?: unknown) => {
      if (provider) {
        instance = new Invariance({
          chain: 'base-sepolia',
          rpcUrl: 'https://sepolia.base.org',
          signer: provider as any,
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

describe('useInvariance (Agent Marketplace)', () => {
  let mockEthereum: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockEthereum = {
      request: vi.fn(),
    };

    Object.defineProperty(window, 'ethereum', {
      writable: true,
      configurable: true,
      value: mockEthereum,
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
    const mockWalletInfo = {
      address: '0x1234567890123456789012345678901234567890',
      chainId: 84532,
      network: 'base-sepolia',
    };

    const mockBalance = {
      usdc: '1000.50',
      eth: '0.5',
      address: '0x1234567890123456789012345678901234567890',
    };

    mockEthereum.request.mockResolvedValue(['0x1234567890123456789012345678901234567890']);

    const { result } = renderHook(() => useInvariance());

    // Mock SDK wallet methods
    vi.spyOn(result.current.inv, 'ensureWalletInit').mockResolvedValue(undefined);
    vi.spyOn(result.current.inv.wallet, 'connect').mockResolvedValue(mockWalletInfo as any);
    vi.spyOn(result.current.inv.wallet, 'balance').mockResolvedValue(mockBalance as any);

    await act(async () => {
      await result.current.connect();
    });

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    expect(result.current.address).toBe('0x1234567890123456789012345678901234567890');
    expect(result.current.balance).toEqual(mockBalance);
    expect(result.current.walletInfo).toEqual(mockWalletInfo);
    expect(result.current.error).toBeNull();
  });

  it('should set connecting state during connection', async () => {
    let resolveRequest: (value: any) => void;
    const requestPromise = new Promise((resolve) => {
      resolveRequest = resolve;
    });

    mockEthereum.request.mockReturnValue(requestPromise);

    const { result } = renderHook(() => useInvariance());

    act(() => {
      result.current.connect();
    });

    await waitFor(() => {
      expect(result.current.connecting).toBe(true);
    });

    resolveRequest!(['0x1234567890123456789012345678901234567890']);

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
    const mockWalletInfo = {
      address: '0x1234567890123456789012345678901234567890',
      chainId: 84532,
      network: 'base-sepolia',
    };

    const mockBalance = {
      usdc: '2500.00',
      eth: '1.25',
      address: '0x1234567890123456789012345678901234567890',
    };

    mockEthereum.request.mockResolvedValue(['0x1234567890123456789012345678901234567890']);

    const { result } = renderHook(() => useInvariance());

    vi.spyOn(result.current.inv, 'ensureWalletInit').mockResolvedValue(undefined);
    vi.spyOn(result.current.inv.wallet, 'connect').mockResolvedValue(mockWalletInfo as any);
    vi.spyOn(result.current.inv.wallet, 'balance').mockResolvedValue(mockBalance as any);

    await act(async () => {
      await result.current.connect();
    });

    await waitFor(() => {
      expect(result.current.balance).toEqual(mockBalance);
    });

    expect(result.current.balance?.usdc).toBe('2500.00');
    expect(result.current.balance?.eth).toBe('1.25');
  });

  it('should handle balance fetch errors gracefully', async () => {
    const mockWalletInfo = {
      address: '0x1234567890123456789012345678901234567890',
      chainId: 84532,
      network: 'base-sepolia',
    };

    mockEthereum.request.mockResolvedValue(['0x1234567890123456789012345678901234567890']);

    const { result } = renderHook(() => useInvariance());

    vi.spyOn(result.current.inv, 'ensureWalletInit').mockResolvedValue(undefined);
    vi.spyOn(result.current.inv.wallet, 'connect').mockResolvedValue(mockWalletInfo as any);
    vi.spyOn(result.current.inv.wallet, 'balance').mockRejectedValue(new Error('Balance fetch failed'));

    await act(async () => {
      await result.current.connect();
    });

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    // Should set default balance on error
    expect(result.current.balance).toEqual({
      usdc: '0.00',
      eth: '0.00',
      address: '0x1234567890123456789012345678901234567890',
    });
  });

  it('should disconnect wallet', async () => {
    const mockWalletInfo = {
      address: '0x1234567890123456789012345678901234567890',
      chainId: 84532,
      network: 'base-sepolia',
    };

    mockEthereum.request.mockResolvedValue(['0x1234567890123456789012345678901234567890']);

    const { result } = renderHook(() => useInvariance());

    vi.spyOn(result.current.inv, 'ensureWalletInit').mockResolvedValue(undefined);
    vi.spyOn(result.current.inv.wallet, 'connect').mockResolvedValue(mockWalletInfo as any);
    vi.spyOn(result.current.inv.wallet, 'balance').mockResolvedValue({
      usdc: '100',
      eth: '0.1',
      address: mockWalletInfo.address,
    } as any);

    // Connect first
    await act(async () => {
      await result.current.connect();
    });

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    // Disconnect
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
    const { resetInvariance } = require('@/lib/invariance');

    act(() => {
      result.current.disconnect();
    });

    expect(resetInvariance).toHaveBeenCalled();
  });

  it('should handle connection errors', async () => {
    mockEthereum.request.mockRejectedValue(new Error('User denied connection'));

    const { result } = renderHook(() => useInvariance());

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
    mockEthereum.request.mockImplementation(async ({ method }: any) => {
      if (method === 'eth_accounts') {
        return ['0x1234567890123456789012345678901234567890'];
      }
      return null;
    });

    const { result } = renderHook(() => useInvariance());

    const mockWalletInfo = {
      address: '0x1234567890123456789012345678901234567890',
      chainId: 84532,
      network: 'base-sepolia',
    };

    vi.spyOn(result.current.inv, 'ensureWalletInit').mockResolvedValue(undefined);
    vi.spyOn(result.current.inv.wallet, 'connect').mockResolvedValue(mockWalletInfo as any);
    vi.spyOn(result.current.inv.wallet, 'balance').mockResolvedValue({
      usdc: '100',
      eth: '0.1',
      address: mockWalletInfo.address,
    } as any);

    // Wait for auto-connect effect
    await waitFor(() => {
      expect(mockEthereum.request).toHaveBeenCalledWith({ method: 'eth_accounts' });
    });
  });

  it('should handle auto-connect errors silently', async () => {
    mockEthereum.request.mockImplementation(async ({ method }: any) => {
      if (method === 'eth_accounts') {
        throw new Error('Failed to get accounts');
      }
      return null;
    });

    const { result } = renderHook(() => useInvariance());

    // Should not throw error or crash
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
    mockEthereum.request
      .mockRejectedValueOnce(new Error('First attempt failed'))
      .mockResolvedValue(['0x1234567890123456789012345678901234567890']);

    const { result } = renderHook(() => useInvariance());

    // First attempt
    await act(async () => {
      await result.current.connect();
    });

    await waitFor(() => {
      expect(result.current.error).toBe('First attempt failed');
    });

    // Mock successful wallet methods
    vi.spyOn(result.current.inv, 'ensureWalletInit').mockResolvedValue(undefined);
    vi.spyOn(result.current.inv.wallet, 'connect').mockResolvedValue({
      address: '0x1234567890123456789012345678901234567890',
      chainId: 84532,
      network: 'base-sepolia',
    } as any);
    vi.spyOn(result.current.inv.wallet, 'balance').mockResolvedValue({
      usdc: '100',
      eth: '0.1',
      address: '0x1234567890123456789012345678901234567890',
    } as any);

    // Second attempt
    await act(async () => {
      await result.current.connect();
    });

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    expect(result.current.error).toBeNull();
  });

  it('should update SDK instance after connection', async () => {
    const mockWalletInfo = {
      address: '0x1234567890123456789012345678901234567890',
      chainId: 84532,
      network: 'base-sepolia',
    };

    mockEthereum.request.mockResolvedValue(['0x1234567890123456789012345678901234567890']);

    const { result } = renderHook(() => useInvariance());
    const initialInv = result.current.inv;

    vi.spyOn(result.current.inv, 'ensureWalletInit').mockResolvedValue(undefined);
    vi.spyOn(result.current.inv.wallet, 'connect').mockResolvedValue(mockWalletInfo as any);
    vi.spyOn(result.current.inv.wallet, 'balance').mockResolvedValue({
      usdc: '100',
      eth: '0.1',
      address: mockWalletInfo.address,
    } as any);

    await act(async () => {
      await result.current.connect();
    });

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    expect(result.current.inv).toBeInstanceOf(Invariance);
  });

  it('should handle wallet initialization errors', async () => {
    mockEthereum.request.mockResolvedValue(['0x1234567890123456789012345678901234567890']);

    const { result } = renderHook(() => useInvariance());

    vi.spyOn(result.current.inv, 'ensureWalletInit').mockRejectedValue(
      new Error('Wallet initialization failed')
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
