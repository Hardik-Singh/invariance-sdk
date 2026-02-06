'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useInvariance } from '@/hooks/useInvariance';
import { useProposals } from '@/hooks/useProposals';
import { PROPOSAL_ACTIONS, type ProposalActionType } from '@/lib/dao-config';

// ---- Dynamic param fields per action type ----

interface ParamField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'select';
  placeholder?: string;
  options?: { value: string; label: string }[];
}

const PARAM_FIELDS: Record<ProposalActionType, ParamField[]> = {
  'deploy-agent': [
    { name: 'agentName', label: 'Agent Name', type: 'text', placeholder: 'e.g. Treasury Ops v2' },
    { name: 'budget', label: 'Budget (USDC)', type: 'number', placeholder: '10000' },
    {
      name: 'runtime',
      label: 'Runtime',
      type: 'select',
      options: [
        { value: 'vercel-edge', label: 'Vercel Edge' },
        { value: 'cloudflare-workers', label: 'Cloudflare Workers' },
        { value: 'self-hosted', label: 'Self-hosted' },
      ],
    },
  ],
  'change-policy': [
    { name: 'policyId', label: 'Policy ID', type: 'text', placeholder: 'pol-xxx' },
    {
      name: 'rule',
      label: 'Rule Type',
      type: 'select',
      options: [
        { value: 'max-spend', label: 'Max Spend' },
        { value: 'daily-limit', label: 'Daily Limit' },
        { value: 'action-whitelist', label: 'Action Whitelist' },
        { value: 'time-window', label: 'Time Window' },
        { value: 'rate-limit', label: 'Rate Limit' },
      ],
    },
    { name: 'newLimit', label: 'New Limit', type: 'number', placeholder: '5000' },
  ],
  'transfer-funds': [
    { name: 'recipient', label: 'Recipient Address', type: 'text', placeholder: '0x...' },
    { name: 'amount', label: 'Amount (USDC)', type: 'number', placeholder: '10000' },
    {
      name: 'token',
      label: 'Token',
      type: 'select',
      options: [
        { value: 'USDC', label: 'USDC' },
        { value: 'ETH', label: 'ETH' },
      ],
    },
  ],
  'upgrade-contract': [
    {
      name: 'contract',
      label: 'Contract',
      type: 'select',
      options: [
        { value: 'PermissionGate', label: 'PermissionGate' },
        { value: 'EscrowVault', label: 'EscrowVault' },
        { value: 'ExecutionLog', label: 'ExecutionLog' },
        { value: 'InvarianceCore', label: 'InvarianceCore' },
      ],
    },
    { name: 'version', label: 'Target Version', type: 'text', placeholder: 'v3' },
    {
      name: 'audit',
      label: 'Audit Status',
      type: 'select',
      options: [
        { value: 'verified', label: 'Verified' },
        { value: 'pending', label: 'Pending' },
        { value: 'not-started', label: 'Not Started' },
      ],
    },
  ],
};

// ---- Page component ----

export default function NewProposalPage() {
  const router = useRouter();
  const { inv, isConnected, address } = useInvariance();
  const { createProposal, isLoading, error } = useProposals();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [action, setAction] = useState<ProposalActionType>('deploy-agent');
  const [params, setParams] = useState<Record<string, string>>({});
  const [localError, setLocalError] = useState<string | null>(null);

  const fields = PARAM_FIELDS[action] ?? [];

  const handleParamChange = (name: string, value: string) => {
    setParams((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!title.trim()) {
      setLocalError('Title is required.');
      return;
    }
    if (!description.trim()) {
      setLocalError('Description is required.');
      return;
    }

    const proposerAddress = address ?? '0xUnknown';

    const proposal = await createProposal(inv!, {
      title: title.trim(),
      description: description.trim(),
      action,
      params,
    }, proposerAddress);

    router.push(`/proposals/${proposal.id}`);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">New Proposal</h1>
        <p className="mt-1 text-sm text-slate-500">
          Submit a governance proposal for the DAO to vote on.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Title */}
        <div>
          <label htmlFor="title" className="mb-1.5 block text-sm font-medium text-slate-300">
            Title
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Short description of the proposal"
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className="mb-1.5 block text-sm font-medium text-slate-300">
            Description
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="Explain what this proposal does and why..."
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Action type */}
        <div>
          <label htmlFor="action" className="mb-1.5 block text-sm font-medium text-slate-300">
            Action Type
          </label>
          <select
            id="action"
            value={action}
            onChange={(e) => {
              setAction(e.target.value as ProposalActionType);
              setParams({});
            }}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          >
            {PROPOSAL_ACTIONS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </div>

        {/* Dynamic params */}
        {fields.length > 0 && (
          <fieldset className="space-y-4 rounded-lg border border-slate-700/50 bg-slate-800/40 p-4">
            <legend className="px-2 text-xs font-medium uppercase tracking-wider text-slate-500">
              Parameters
            </legend>
            {fields.map((field) => (
              <div key={field.name}>
                <label
                  htmlFor={field.name}
                  className="mb-1.5 block text-sm font-medium text-slate-300"
                >
                  {field.label}
                </label>
                {field.type === 'select' ? (
                  <select
                    id={field.name}
                    value={params[field.name] ?? ''}
                    onChange={(e) => handleParamChange(field.name, e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">Select...</option>
                    {field.options?.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={field.name}
                    type={field.type}
                    value={params[field.name] ?? ''}
                    onChange={(e) => handleParamChange(field.name, e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                )}
              </div>
            ))}
          </fieldset>
        )}

        {/* Errors */}
        {(localError || error) && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {localError ?? error}
          </div>
        )}

        {/* Submit info */}
        {!isConnected && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
            Connect your wallet to submit proposals on-chain. The form will still work in demo mode.
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {isLoading ? 'Submitting...' : 'Submit Proposal'}
        </button>
      </form>
    </div>
  );
}
