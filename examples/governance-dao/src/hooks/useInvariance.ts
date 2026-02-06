'use client';

import { useState, useCallback, useEffect } from 'react';
import type { Invariance } from '@invariance/sdk';
import { getInvariance, getInvarianceInstance } from '@/lib/invariance';

interface UseInvarianceReturn {
  /** The SDK instance (null until connected) */
  inv: Invariance | null;
  /** Whether a wallet is connected and the SDK initialised */
  isConnected: boolean;
  /** The currently connected wallet address */
  address: string | null;
  /** True while `connect()` is in progress */
  isConnecting: boolean;
  /** Human-readable error message if connection failed */
  error: string | null;
  /** Trigger wallet connection via window.ethereum */
  connect: () => Promise<void>;
}

/**
 * React hook that manages the Invariance SDK lifecycle.
 *
 * On mount it checks whether an instance already exists.  `connect()` requests
 * accounts from the injected provider (MetaMask / Coinbase Wallet / etc.) and
 * passes the EIP-1193 provider into the SDK.
 */
export function useInvariance(): UseInvarianceReturn {
  const [inv, setInv] = useState<Invariance | null>(getInvarianceInstance);
  const [address, setAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // On mount, pick up an existing instance (e.g. after hot-reload)
  useEffect(() => {
    const existing = getInvarianceInstance();
    if (existing) {
      setInv(existing);
    }
  }, []);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);

    try {
      const ethereum = (window as unknown as Record<string, unknown>).ethereum as
        | { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> }
        | undefined;

      if (!ethereum) {
        throw new Error('No wallet detected. Please install MetaMask or another browser wallet.');
      }

      // Request account access
      const accounts = (await ethereum.request({
        method: 'eth_requestAccounts',
      })) as string[];

      if (!accounts[0]) {
        throw new Error('No account returned from wallet.');
      }

      // Switch / add Base Sepolia
      try {
        await ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x14A34' }], // 84532
        });
      } catch {
        // Chain not added yet -- attempt to add it
        await ethereum.request({
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
      }

      const instance = await getInvariance(ethereum);
      setInv(instance);
      setAddress(accounts[0]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect wallet';
      setError(message);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  return {
    inv,
    isConnected: inv !== null && address !== null,
    address,
    isConnecting,
    error,
    connect,
  };
}
