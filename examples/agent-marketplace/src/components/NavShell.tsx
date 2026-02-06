'use client';

/**
 * Top navigation bar + page wrapper.
 *
 * Provides the Invariance context to all children via the hook.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ConnectWallet from './ConnectWallet';
import { useInvariance } from '@/hooks/useInvariance';

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/agents', label: 'Browse Agents' },
  { href: '/register', label: 'Register Agent' },
  { href: '/dashboard', label: 'Dashboard' },
];

export default function NavShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isConnected, address, balance, connecting, error, connect, disconnect } =
    useInvariance();

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-sm font-bold text-white">
              I
            </div>
            <span className="text-lg font-bold tracking-tight text-gray-900">
              Invariance <span className="font-normal text-gray-400">Marketplace</span>
            </span>
          </Link>

          {/* Nav links */}
          <nav className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    active
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* Wallet */}
          <ConnectWallet
            isConnected={isConnected}
            address={address}
            balance={balance}
            connecting={connecting}
            error={error}
            onConnect={connect}
            onDisconnect={disconnect}
          />
        </div>
      </header>

      <main>{children}</main>
    </>
  );
}
