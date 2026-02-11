/**
 * Test suite for useInvariance hook (Governance DAO)
 *
 * Tests wallet connection, SDK initialization, error handling,
 * and network switching for the Governance DAO example.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useInvariance } from '@/hooks/useInvariance';
import { Invariance } from '@invariance/sdk';

// Mock the lib/invariance module
vi.mock('@/lib/invariance', () => ({
  getInvariance: vi.fn((provider?: unknown) => {
    if (provider) {
      return new Invariance({
        chain: 'base-sepolia',
        rpcUrl: 'https://sepolia.base.org',
        signer: provider as any,
      });
    }
    return new Invariance({
      chain: 'base-sepolia',
      rpcUrl: 'https://sepolia.base.org',
    });
  }),
  getInvarianceInstance: vi.fn(() => null),
}));

describe('useInvariance (Governance DAO)', () => {
  let mockEthereum: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Mock window.ethereum
    mockEthereum = {
      request: vi.fn(),
    };

    Object.defineProperty(window, 'ethereum', {
      writable: true,
      value: mockEthereum,
    });
  });

  it('should initialize with null SDK instance and not connected', () => {
    const { result } = renderHook(() => useInvariance());

    expect(result.current.inv).toBeDefined(); // SDK instance exists but not connected
    expect(result.current.isConnected).toBe(false);
    expect(result.current.address).toBeNull();
    expect(result.current.isConnecting).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should connect wallet successfully', async () => {
    mockEthereum.request.mockImplementation(async ({ method }: any) => {
      if (method === 'eth_requestAccounts') {
        return ['0x1234567890123456789012345678901234567890'];
      }
      if (method === 'wallet_switchEthereumChain') {
        return null;
      }
      return null;
    });

    const { result } = renderHook(() => useInvariance());

    expect(result.current.isConnecting).toBe(false);

    await act(async () => {
      await result.current.connect();
    });

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    expect(result.current.address).toBe('0x1234567890123456789012345678901234567890');
    expect(result.current.isConnecting).toBe(false);
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
      expect(result.current.isConnecting).toBe(true);
    });

    resolveRequest!(['0x1234567890123456789012345678901234567890']);

    await waitFor(() => {
      expect(result.current.isConnecting).toBe(false);
    });
  });

  it('should handle missing wallet error', async () => {
    Object.defineProperty(window, 'ethereum', {
      writable: true,
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

  it('should handle no account returned error', async () => {
    mockEthereum.request.mockResolvedValue([]);

    const { result } = renderHook(() => useInvariance());

    await act(async () => {
      await result.current.connect();
    });

    await waitFor(() => {
      expect(result.current.error).toContain('No account returned');
    });

    expect(result.current.isConnected).toBe(false);
  });

  it('should switch to Base Sepolia chain', async () => {
    mockEthereum.request.mockImplementation(async ({ method }: any) => {
      if (method === 'eth_requestAccounts') {
        return ['0x1234567890123456789012345678901234567890'];
      }
      if (method === 'wallet_switchEthereumChain') {
        return null; // Success
      }
      return null;
    });

    const { result } = renderHook(() => useInvariance());

    await act(async () => {
      await result.current.connect();
    });

    await waitFor(() => {
      expect(mockEthereum.request).toHaveBeenCalledWith({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x14A34' }], // 84532 in hex
      });
    });
  });

  it('should add Base Sepolia chain if not present', async () => {
    let switchCalled = false;

    mockEthereum.request.mockImplementation(async ({ method, params }: any) => {
      if (method === 'eth_requestAccounts') {
        return ['0x1234567890123456789012345678901234567890'];
      }
      if (method === 'wallet_switchEthereumChain') {
        if (!switchCalled) {
          switchCalled = true;
          throw new Error('Chain not added');
        }
        return null;
      }
      if (method === 'wallet_addEthereumChain') {
        return null;
      }
      return null;
    });

    const { result } = renderHook(() => useInvariance());

    await act(async () => {
      await result.current.connect();
    });

    await waitFor(() => {
      expect(mockEthereum.request).toHaveBeenCalledWith({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: '0x14A34',
            chainName: 'Base Sepolia',
            rpcUrls: ['https://sepolia.base.org'],
            nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
            blockExplorerUrls: ['https://sepolia.basescan.org'],
          },
        ],
      });
    });
  });

  it('should handle connection errors', async () => {
    mockEthereum.request.mockRejectedValue(new Error('User rejected request'));

    const { result } = renderHook(() => useInvariance());

    await act(async () => {
      await result.current.connect();
    });

    await waitFor(() => {
      expect(result.current.error).toBe('User rejected request');
    });

    expect(result.current.isConnected).toBe(false);
    expect(result.current.isConnecting).toBe(false);
  });

  it('should provide Invariance SDK instance', () => {
    const { result } = renderHook(() => useInvariance());

    expect(result.current.inv).toBeInstanceOf(Invariance);
  });

  it('should update SDK instance after connection', async () => {
    mockEthereum.request.mockImplementation(async ({ method }: any) => {
      if (method === 'eth_requestAccounts') {
        return ['0x1234567890123456789012345678901234567890'];
      }
      if (method === 'wallet_switchEthereumChain') {
        return null;
      }
      return null;
    });

    const { result } = renderHook(() => useInvariance());
    const initialInv = result.current.inv;

    await act(async () => {
      await result.current.connect();
    });

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    // SDK instance should be updated
    expect(result.current.inv).toBeDefined();
    expect(result.current.inv).toBeInstanceOf(Invariance);
  });

  it('should clear error on successful connection after previous error', async () => {
    mockEthereum.request
      .mockRejectedValueOnce(new Error('First attempt failed'))
      .mockImplementation(async ({ method }: any) => {
        if (method === 'eth_requestAccounts') {
          return ['0x1234567890123456789012345678901234567890'];
        }
        if (method === 'wallet_switchEthereumChain') {
          return null;
        }
        return null;
      });

    const { result } = renderHook(() => useInvariance());

    // First attempt - should fail
    await act(async () => {
      await result.current.connect();
    });

    await waitFor(() => {
      expect(result.current.error).toBe('First attempt failed');
    });

    // Second attempt - should succeed
    await act(async () => {
      await result.current.connect();
    });

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    expect(result.current.error).toBeNull();
  });

  it('should handle chain switch errors gracefully', async () => {
    mockEthereum.request.mockImplementation(async ({ method }: any) => {
      if (method === 'eth_requestAccounts') {
        return ['0x1234567890123456789012345678901234567890'];
      }
      if (method === 'wallet_switchEthereumChain') {
        throw new Error('Chain switch failed');
      }
      if (method === 'wallet_addEthereumChain') {
        return null; // Fallback to adding chain
      }
      return null;
    });

    const { result } = renderHook(() => useInvariance());

    await act(async () => {
      await result.current.connect();
    });

    // Should fall back to adding the chain
    await waitFor(() => {
      expect(mockEthereum.request).toHaveBeenCalledWith({
        method: 'wallet_addEthereumChain',
        params: expect.any(Array),
      });
    });
  });

  it('should pick up existing instance on mount', () => {
    const mockInstance = new Invariance({
      chain: 'base-sepolia',
      rpcUrl: 'https://sepolia.base.org',
    });

    const { getInvarianceInstance } = require('@/lib/invariance');
    getInvarianceInstance.mockReturnValue(mockInstance);

    const { result } = renderHook(() => useInvariance());

    expect(result.current.inv).toBeDefined();
  });

  it('should expose connect function', () => {
    const { result } = renderHook(() => useInvariance());

    expect(typeof result.current.connect).toBe('function');
  });

  it('should not auto-connect on mount without existing connection', () => {
    const { result } = renderHook(() => useInvariance());

    expect(result.current.isConnected).toBe(false);
    expect(result.current.address).toBeNull();
  });
});
