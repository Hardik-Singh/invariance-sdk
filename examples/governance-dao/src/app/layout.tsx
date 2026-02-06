import type { Metadata } from 'next';
import './globals.css';
import { Sidebar } from './Sidebar';

export const metadata: Metadata = {
  title: 'AI Governance DAO | Invariance',
  description:
    'Democratic governance for AI agents — propose, vote, execute, and audit every action on-chain.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        <div className="flex min-h-screen">
          {/* Sidebar navigation */}
          <Sidebar />

          {/* Main content area */}
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
