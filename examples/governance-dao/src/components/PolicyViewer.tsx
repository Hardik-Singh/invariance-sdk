'use client';

import type { PolicyRule } from '@invariance/sdk';

// ---- Icons per rule type ----

function ruleIcon(type: string): string {
  switch (type) {
    case 'max-spend':
    case 'max-per-tx':
    case 'daily-limit':
      return '$';
    case 'action-whitelist':
    case 'action-blacklist':
      return 'L';
    case 'target-whitelist':
    case 'target-blacklist':
      return 'T';
    case 'time-window':
      return 'W';
    case 'cooldown':
      return 'C';
    case 'rate-limit':
      return 'R';
    case 'require-state':
      return 'S';
    case 'require-balance':
      return 'B';
    case 'require-approval':
      return 'A';
    case 'require-attestation':
      return 'V';
    default:
      return '?';
  }
}

function ruleColor(type: string): string {
  switch (type) {
    case 'max-spend':
    case 'max-per-tx':
    case 'daily-limit':
      return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    case 'action-whitelist':
    case 'action-blacklist':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'time-window':
    case 'cooldown':
      return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    case 'require-approval':
    case 'require-attestation':
      return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    case 'rate-limit':
      return 'bg-red-500/20 text-red-400 border-red-500/30';
    default:
      return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
  }
}

function formatConfig(config: Record<string, unknown>): string[] {
  return Object.entries(config).map(([key, value]) => {
    const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
    if (Array.isArray(value)) {
      return `${label}: ${value.join(', ')}`;
    }
    return `${label}: ${String(value)}`;
  });
}

// ---- Component ----

interface PolicyViewerProps {
  rules: PolicyRule[];
}

export function PolicyViewer({ rules }: PolicyViewerProps) {
  if (rules.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-500">
        No policy rules configured.
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {rules.map((rule, idx) => {
        const color = ruleColor(rule.type);
        const icon = ruleIcon(rule.type);
        const lines = formatConfig(rule.config);

        return (
          <div
            key={`${rule.type}-${idx}`}
            className={`rounded-lg border p-4 ${color}`}
          >
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-black/20 text-xs font-bold">
                {icon}
              </span>
              <span className="text-sm font-semibold capitalize">
                {rule.type.replaceAll('-', ' ')}
              </span>
            </div>
            <ul className="space-y-0.5">
              {lines.map((line) => (
                <li key={line} className="text-xs opacity-80">
                  {line}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
