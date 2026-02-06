import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Agent Marketplace | Invariance Protocol',
  description:
    'Discover, hire, and verify AI agents with on-chain escrow and reputation powered by Invariance Protocol.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="antialiased">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <NavShell>{children}</NavShell>
      </body>
    </html>
  );
}

// ---------------------------------------------------------------------------
// Navigation shell (client component embedded inline to keep layout.tsx simple)
// ---------------------------------------------------------------------------
import NavShell from '@/components/NavShell';
