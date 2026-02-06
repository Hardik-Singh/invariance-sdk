'use client';

import { use } from 'react';
import Link from 'next/link';
import { useInvariance } from '@/hooks/useInvariance';
import { DAO_CONFIG } from '@/lib/dao-config';
import { PolicyViewer } from '@/components/PolicyViewer';
import { AuditLog } from '@/components/AuditLog';
import type { PolicyRule } from '@invariance/sdk';

// ---- Build demo policy rules from agent config ----

function buildPolicyRules(agent: (typeof DAO_CONFIG.agents)[number]): PolicyRule[] {
  const rules: PolicyRule[] = [];

  // Spending cap
  rules.push({
    type: 'max-spend',
    config: {
      limit: agent.limitUSDC,
      token: 'USDC',
      period: '30d',
    },
  });

  // Daily limit (half of total)
  rules.push({
    type: 'daily-limit',
    config: {
      limit: String(Math.floor(parseInt(agent.limitUSDC, 10) / 10)),
      token: 'USDC',
    },
  });

  // Action whitelist
  rules.push({
    type: 'action-whitelist',
    config: {
      actions: agent.allowedActions,
    },
  });

  // Time window
  rules.push({
    type: 'time-window',
    config: {
      start: '08:00',
      end: '22:00',
      timezone: 'UTC',
    },
  });

  // Rate limit
  rules.push({
    type: 'rate-limit',
    config: {
      maxActions: 100,
      period: '1h',
    },
  });

  return rules;
}

// ---- Page ----

export default function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { inv } = useInvariance();

  const agent = DAO_CONFIG.agents.find((a) => a.id === id);

  if (!agent) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <h2 className="text-xl font-bold text-slate-100">Agent not found</h2>
        <p className="mt-2 text-sm text-slate-500">
          ID <code className="text-slate-400">{id}</code> does not match any
          registered agent.
        </p>
        <Link
          href="/agents"
          className="mt-4 text-sm text-indigo-400 hover:underline"
        >
          Back to agents
        </Link>
      </div>
    );
  }

  const rules = buildPolicyRules(agent);
  const spentNum = parseInt(agent.spentUSDC, 10);
  const limitNum = parseInt(agent.limitUSDC, 10);
  const spentPercent = limitNum > 0 ? (spentNum / limitNum) * 100 : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* Back link */}
      <Link
        href="/agents"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-300"
      >
        <span>&larr;</span> All Agents
      </Link>

      {/* Header */}
      <div>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold text-slate-100">{agent.name}</h1>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium capitalize ${
              agent.status === 'active'
                ? 'bg-emerald-500/20 text-emerald-400'
                : agent.status === 'paused'
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'bg-blue-500/20 text-blue-400'
            }`}
          >
            {agent.status}
          </span>
        </div>
        <p className="mt-2 text-sm text-slate-400">{agent.description}</p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <span>
            Address:{' '}
            <span className="font-mono text-slate-400">
              {agent.address.slice(0, 8)}...{agent.address.slice(-4)}
            </span>
          </span>
          <span>
            Policy:{' '}
            <span className="font-mono text-indigo-400">{agent.policyId}</span>
          </span>
        </div>
      </div>

      {/* Spending breakdown */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/60 p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-300">
          Spending Breakdown
        </h3>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <StatBlock label="Total Spent" value={`$${agent.spentUSDC}`} />
          <StatBlock label="Budget Limit" value={`$${agent.limitUSDC}`} />
          <StatBlock
            label="Remaining"
            value={`$${limitNum - spentNum}`}
            color={
              spentPercent > 80
                ? 'text-red-400'
                : spentPercent > 50
                  ? 'text-amber-400'
                  : 'text-emerald-400'
            }
          />
        </div>
        <div className="h-3 w-full rounded-full bg-slate-700 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              spentPercent > 80
                ? 'bg-red-500'
                : spentPercent > 50
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
            }`}
            style={{ width: `${Math.min(spentPercent, 100)}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs text-slate-500 text-right">
          {spentPercent.toFixed(1)}% of budget used
        </p>
      </div>

      {/* Policy rules */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/60 p-5">
        <h3 className="mb-4 text-sm font-semibold text-slate-300">
          Policy Rules
        </h3>
        <PolicyViewer rules={rules} />
      </div>

      {/* Allowed actions */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/60 p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-300">
          Allowed Actions
        </h3>
        <div className="flex flex-wrap gap-2">
          {agent.allowedActions.map((a) => (
            <span
              key={a}
              className="rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 text-sm text-blue-400"
            >
              {a}
            </span>
          ))}
        </div>
      </div>

      {/* Activity log */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/60 p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-300">
          Recent Activity
        </h3>
        <AuditLog
          inv={inv}
          filters={{ actor: agent.address, limit: 10 }}
          compact
        />
      </div>
    </div>
  );
}

// ---- helpers ----

function StatBlock({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="text-center">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className={`mt-0.5 text-lg font-bold ${color ?? 'text-slate-200'}`}>
        {value}
      </p>
    </div>
  );
}
