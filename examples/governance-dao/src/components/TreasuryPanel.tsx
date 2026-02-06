'use client';

import { useState, useEffect } from 'react';
import type { Invariance, EscrowStatus } from '@invariance/sdk';
import { DAO_CONFIG } from '@/lib/dao-config';

// ---- Demo data for when SDK throws TODO ----

interface TreasuryTransaction {
  id: string;
  action: string;
  amount: string;
  direction: 'in' | 'out';
  timestamp: number;
  counterparty: string;
}

const MOCK_TRANSACTIONS: TreasuryTransaction[] = [
  {
    id: 'tx-1',
    action: 'Agent payroll',
    amount: '2,400',
    direction: 'out',
    timestamp: Date.now() - 86_400_000,
    counterparty: 'Treasury Ops Agent',
  },
  {
    id: 'tx-2',
    action: 'Yield claim',
    amount: '1,120',
    direction: 'in',
    timestamp: Date.now() - 172_800_000,
    counterparty: 'Aave v3 Pool',
  },
  {
    id: 'tx-3',
    action: 'Security bounty',
    amount: '500',
    direction: 'out',
    timestamp: Date.now() - 345_600_000,
    counterparty: '0xBounty...Abc',
  },
  {
    id: 'tx-4',
    action: 'Member contribution',
    amount: '10,000',
    direction: 'in',
    timestamp: Date.now() - 604_800_000,
    counterparty: 'Alice',
  },
];

// ---- Component ----

interface TreasuryPanelProps {
  inv: Invariance | null;
  compact?: boolean;
}

export function TreasuryPanel({ inv, compact }: TreasuryPanelProps) {
  const [balance] = useState(DAO_CONFIG.treasuryAmount);
  const [escrowStatus, setEscrowStatus] = useState<EscrowStatus | null>(null);

  // Attempt to fetch live escrow status
  useEffect(() => {
    if (!inv) return;

    let cancelled = false;
    (async () => {
      try {
        const status = await inv.escrow.status('escrow-dao-treasury');
        if (!cancelled) setEscrowStatus(status);
      } catch {
        // SDK methods throw TODO -- we use mock data
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inv]);

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/60 p-5">
      {/* Balance header */}
      <div className="mb-4">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
          DAO Treasury
        </p>
        <p className="mt-1 text-3xl font-bold text-slate-100">
          ${balance}{' '}
          <span className="text-base font-normal text-slate-500">USDC</span>
        </p>
        {escrowStatus && (
          <p className="mt-0.5 text-xs text-slate-500">
            Escrow state:{' '}
            <span className="capitalize text-indigo-400">{escrowStatus.state}</span>
          </p>
        )}
      </div>

      {/* Stat row */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <StatCard label="Signers" value={`${DAO_CONFIG.members.length}`} />
        <StatCard label="Threshold" value={`${DAO_CONFIG.threshold / 100}%`} />
        <StatCard label="Escrow" value={escrowStatus?.state ?? 'funded'} />
      </div>

      {/* Recent transactions */}
      {!compact && (
        <>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
            Recent Transactions
          </h4>
          <ul className="space-y-2">
            {MOCK_TRANSACTIONS.map((tx) => (
              <li
                key={tx.id}
                className="flex items-center justify-between rounded-lg bg-slate-900/40 px-3 py-2"
              >
                <div>
                  <p className="text-sm text-slate-300">{tx.action}</p>
                  <p className="text-xs text-slate-500">{tx.counterparty}</p>
                </div>
                <span
                  className={`text-sm font-medium ${
                    tx.direction === 'in' ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {tx.direction === 'in' ? '+' : '-'}${tx.amount}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// ---- Small stat card ----

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-900/40 px-3 py-2 text-center">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold capitalize text-slate-200">{value}</p>
    </div>
  );
}
