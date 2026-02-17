'use client';

/**
 * React hook for interacting with the Invariance SDK.
 *
 * Manages wallet connection state and exposes the SDK instance
 * so components can call marketplace / reputation / escrow methods.
 */
import { useCallback, useEffect, useState } from 'react';
import type { Invariance, EIP1193Provider, WalletInfo, BalanceInfo } from '@invariance/sdk';
import { getInvariance, resetInvariance } from '@/lib/invariance';

export interface UseInvarianceReturn {
  /** The SDK client instance (always available for read-only calls). */
  inv: Invariance;
  /** Whether a wallet is currently connected. */
  isConnected: boolean;
  /** The connected wallet address, or null. */
  address: string | null;
  /** USDC + ETH balance of the connected wallet. */
  balance: BalanceInfo | null;
  /** Wallet metadata. */
  walletInfo: WalletInfo | null;
  /** Connect a browser wallet (MetaMask / Coinbase). */
  connect: () => Promise<void>;
  /** Disconnect the current wallet. */
  disconnect: () => void;
  /** Whether a connection attempt is in progress. */
  connecting: boolean;
  /** Last error message, if any. */
  error: string | null;
}

export function useInvariance(): UseInvarianceReturn {
  const [inv, setInv] = useState<Invariance>(() => getInvariance());
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<BalanceInfo | null>(null);
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ------------------------------------------------------------------
  // Fetch balance for a connected address
  // ------------------------------------------------------------------
  const refreshBalance = useCallback(
    async (client: Invariance, addr: string) => {
      try {
        const bal = await client.wallet.balance(addr);
        setBalance(bal);
      } catch {
        // SDK methods may throw TODO — swallow gracefully
        setBalance({ usdc: '0.00', eth: '0.00', address: addr });
      }
    },
    [],
  );

  // ------------------------------------------------------------------
  // Connect
  // ------------------------------------------------------------------
  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);

    try {
      const ethereum = (
        typeof window !== 'undefined'
          ? (window as unknown as Record<string, unknown>).ethereum
          : undefined
      ) as EIP1193Provider | undefined;

      if (!ethereum) {
        throw new Error('No wallet detected. Please install MetaMask or Coinbase Wallet.');
      }

      // Re-create the SDK instance with the signer
      const client = getInvariance(ethereum);
      await client.ensureWalletInit();

      const info = await client.wallet.get();
      setInv(client);
      setWalletInfo(info);
      setAddress(info.address);
      setIsConnected(true);

      await refreshBalance(client, info.address);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Wallet connection failed';
      setError(message);
      // Still provide a read-only instance
      setIsConnected(false);
    } finally {
      setConnecting(false);
    }
  }, [refreshBalance]);

  // ------------------------------------------------------------------
  // Disconnect
  // ------------------------------------------------------------------
  const disconnect = useCallback(() => {
    resetInvariance();
    setInv(getInvariance());
    setIsConnected(false);
    setAddress(null);
    setBalance(null);
    setWalletInfo(null);
    setError(null);
  }, []);

  // ------------------------------------------------------------------
  // Eagerly check if wallet was previously connected (page reload)
  // ------------------------------------------------------------------
  useEffect(() => {
    const ethereum = (
      typeof window !== 'undefined'
        ? (window as unknown as Record<string, unknown>).ethereum
        : undefined
    ) as EIP1193Provider | undefined;

    if (!ethereum) return;

    (async () => {
      try {
        const accounts = (await ethereum.request({
          method: 'eth_accounts',
        })) as string[];
        if (accounts.length > 0) {
          await connect();
        }
      } catch {
        // Silently ignore — user will connect manually
      }
    })();
    // Run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    inv,
    isConnected,
    address,
    balance,
    walletInfo,
    connect,
    disconnect,
    connecting,
    error,
  };
}
