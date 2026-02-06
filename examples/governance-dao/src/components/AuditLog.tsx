'use client';

import { useState, useEffect } from 'react';
import type { Invariance, LedgerEntry, ActorReference } from '@invariance/sdk';
import { DAO_CONFIG } from '@/lib/dao-config';

// ---- Demo data ----

function mockActor(address: string, type: 'human' | 'agent' = 'human'): ActorReference {
  return { type, address };
}

const MOCK_ENTRIES: LedgerEntry[] = [
  {
    entryId: 'log-001',
    action: 'proposal-created',
    actor: mockActor(DAO_CONFIG.members[0].address),
    category: 'custom',
    txHash: '0xabc1230000000000000000000000000000000000000000000000000000000001',
    blockNumber: 18_200_001,
    timestamp: Date.now() - 172_800_000,
    proof: { proofHash: '0xproof1', signatures: { actor: '0xsig1', valid: true }, metadataHash: '0xmeta1', verifiable: true, raw: '' },
    metadataHash: '0xmeta1',
    metadata: { title: 'Deploy Treasury Ops Agent v2' },
    explorerUrl: 'https://sepolia.basescan.org/tx/0xabc123',
  },
  {
    entryId: 'log-002',
    action: 'vote-cast',
    actor: mockActor(DAO_CONFIG.members[1].address),
    category: 'execution',
    txHash: '0xdef4560000000000000000000000000000000000000000000000000000000002',
    blockNumber: 18_200_050,
    timestamp: Date.now() - 86_400_000,
    proof: { proofHash: '0xproof2', signatures: { actor: '0xsig2', valid: true }, metadataHash: '0xmeta2', verifiable: true, raw: '' },
    metadataHash: '0xmeta2',
    metadata: { proposalId: 'intent-001', vote: 'for' },
    explorerUrl: 'https://sepolia.basescan.org/tx/0xdef456',
  },
  {
    entryId: 'log-003',
    action: 'agent-deployed',
    actor: mockActor(DAO_CONFIG.agents[0].address, 'agent'),
    category: 'execution',
    txHash: '0x7890ab0000000000000000000000000000000000000000000000000000000003',
    blockNumber: 18_200_120,
    timestamp: Date.now() - 43_200_000,
    proof: { proofHash: '0xproof3', signatures: { actor: '0xsig3', valid: true }, metadataHash: '0xmeta3', verifiable: true, raw: '' },
    metadataHash: '0xmeta3',
    metadata: { agentName: 'Treasury Ops Agent' },
    explorerUrl: 'https://sepolia.basescan.org/tx/0x7890ab',
  },
  {
    entryId: 'log-004',
    action: 'policy-evaluated',
    actor: mockActor(DAO_CONFIG.agents[1].address, 'agent'),
    category: 'policy',
    txHash: '0xcdef010000000000000000000000000000000000000000000000000000000004',
    blockNumber: 18_200_200,
    timestamp: Date.now() - 21_600_000,
    proof: { proofHash: '0xproof4', signatures: { actor: '0xsig4', valid: true }, metadataHash: '0xmeta4', verifiable: true, raw: '' },
    metadataHash: '0xmeta4',
    metadata: { result: 'allowed', rule: 'max-spend' },
    explorerUrl: 'https://sepolia.basescan.org/tx/0xcdef01',
  },
  {
    entryId: 'log-005',
    action: 'escrow-funded',
    actor: mockActor(DAO_CONFIG.members[0].address),
    category: 'payment',
    txHash: '0x1122330000000000000000000000000000000000000000000000000000000005',
    blockNumber: 18_200_250,
    timestamp: Date.now() - 7_200_000,
    proof: { proofHash: '0xproof5', signatures: { actor: '0xsig5', valid: true }, metadataHash: '0xmeta5', verifiable: true, raw: '' },
    metadataHash: '0xmeta5',
    metadata: { amount: '50000', token: 'USDC' },
    explorerUrl: 'https://sepolia.basescan.org/tx/0x112233',
  },
];

// ---- Helpers ----

function categoryBadge(cat: string): { bg: string; text: string } {
  switch (cat) {
    case 'execution':
      return { bg: 'bg-blue-500/20', text: 'text-blue-400' };
    case 'payment':
      return { bg: 'bg-emerald-500/20', text: 'text-emerald-400' };
    case 'policy':
      return { bg: 'bg-amber-500/20', text: 'text-amber-400' };
    case 'attestation':
      return { bg: 'bg-purple-500/20', text: 'text-purple-400' };
    default:
      return { bg: 'bg-slate-500/20', text: 'text-slate-400' };
  }
}

function truncateHash(hash: string): string {
  if (hash.length <= 14) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-4)}`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function resolveActorLabel(actor: ActorReference): string {
  const member = DAO_CONFIG.members.find(
    (m) => m.address.toLowerCase() === actor.address.toLowerCase(),
  );
  if (member) return member.label;
  const agent = DAO_CONFIG.agents.find(
    (a) => a.address.toLowerCase() === actor.address.toLowerCase(),
  );
  if (agent) return agent.name;
  return truncateHash(actor.address);
}

// ---- Component ----

interface AuditLogProps {
  inv: Invariance | null;
  filters?: { actor?: string; action?: string; limit?: number };
  compact?: boolean;
}

export function AuditLog({ inv, filters, compact }: AuditLogProps) {
  const [entries, setEntries] = useState<LedgerEntry[]>(MOCK_ENTRIES);

  useEffect(() => {
    if (!inv) return;

    let cancelled = false;
    (async () => {
      try {
        const result = await inv.ledger.query({
          actor: filters?.actor,
          action: filters?.action,
          limit: filters?.limit ?? 50,
          order: 'desc',
        });
        if (!cancelled && Array.isArray(result)) {
          setEntries(result);
        }
      } catch {
        // SDK throws TODO -- keep mock data
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inv, filters?.actor, filters?.action, filters?.limit]);

  const displayEntries = compact ? entries.slice(0, 5) : entries;

  return (
    <div className="space-y-0">
      {displayEntries.map((entry, idx) => {
        const badge = categoryBadge(entry.category);
        return (
          <div
            key={entry.entryId}
            className="relative flex gap-3 py-3"
          >
            {/* Timeline line */}
            {idx < displayEntries.length - 1 && (
              <div className="absolute left-[9px] top-8 h-full w-px bg-slate-700" />
            )}

            {/* Dot */}
            <div className="relative z-10 mt-1.5 h-[18px] w-[18px] shrink-0 rounded-full border-2 border-slate-600 bg-slate-800" />

            {/* Content */}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-slate-200">
                  {entry.action.replaceAll('-', ' ')}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${badge.bg} ${badge.text}`}
                >
                  {entry.category}
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                <span>
                  by{' '}
                  <span className="text-slate-400">
                    {resolveActorLabel(entry.actor)}
                  </span>
                </span>
                <span>{formatTime(entry.timestamp)}</span>
                <a
                  href={entry.explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-indigo-400 hover:underline"
                >
                  {truncateHash(entry.txHash)}
                </a>
              </div>
            </div>
          </div>
        );
      })}

      {displayEntries.length === 0 && (
        <p className="py-8 text-center text-sm text-slate-500">
          No audit log entries yet.
        </p>
      )}
    </div>
  );
}
