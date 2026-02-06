'use client';

/**
 * Wallet connect button with address display and disconnect dropdown.
 */
import { useState, useRef, useEffect } from 'react';
import type { BalanceInfo } from '@invariance/sdk';

interface ConnectWalletProps {
  isConnected: boolean;
  address: string | null;
  balance: BalanceInfo | null;
  connecting: boolean;
  error: string | null;
  onConnect: () => Promise<void>;
  onDisconnect: () => void;
}

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function ConnectWallet({
  isConnected,
  address,
  balance,
  connecting,
  error,
  onConnect,
  onDisconnect,
}: ConnectWalletProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!isConnected) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          onClick={onConnect}
          disabled={connecting}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
        >
          {connecting ? 'Connecting...' : 'Connect Wallet'}
        </button>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setDropdownOpen((prev) => !prev)}
        className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm transition hover:border-indigo-300 hover:shadow-sm"
      >
        {/* Wallet icon */}
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs text-indigo-700">
          W
        </span>

        <span className="font-mono text-gray-800">
          {address ? truncateAddress(address) : '---'}
        </span>

        {balance && (
          <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
            {balance.usdc} USDC
          </span>
        )}

        {/* Chevron */}
        <svg
          className={`h-4 w-4 text-gray-400 transition ${dropdownOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {dropdownOpen && (
        <div className="absolute right-0 z-50 mt-2 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          <div className="border-b border-gray-100 px-4 py-2">
            <p className="text-xs text-gray-500">Connected</p>
            <p className="font-mono text-sm text-gray-800">
              {address ? truncateAddress(address) : '---'}
            </p>
            {balance && (
              <div className="mt-1 flex gap-3 text-xs text-gray-600">
                <span>{balance.usdc} USDC</span>
                <span>{balance.eth} ETH</span>
              </div>
            )}
          </div>
          <button
            onClick={() => {
              onDisconnect();
              setDropdownOpen(false);
            }}
            className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
