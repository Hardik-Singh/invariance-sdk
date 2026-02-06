'use client';

import { useState, useCallback } from 'react';
import type { Invariance, IntentStatus, IntentLifecycle } from '@invariance/sdk';
import { DAO_CONFIG } from '@/lib/dao-config';

// ---- Types ----

export interface Proposal {
  id: string;
  title: string;
  description: string;
  proposer: string;
  status: IntentLifecycle;
  votesFor: number;
  votesAgainst: number;
  voters: { address: string; approved: boolean; timestamp: number }[];
  createdAt: number;
  action: string;
  params: Record<string, unknown>;
}

export interface CreateProposalInput {
  title: string;
  description: string;
  action: string;
  params: Record<string, unknown>;
}

// ---- Demo data (shown before the SDK is live) ----

const now = Date.now();

const MOCK_PROPOSALS: Proposal[] = [
  {
    id: 'intent-001',
    title: 'Deploy Treasury Ops Agent v2',
    description:
      'Upgrade the Treasury Ops agent to v2 with improved yield farming strategies and tighter risk controls. The new version includes automated stop-loss triggers and portfolio rebalancing.',
    proposer: DAO_CONFIG.members[0].address,
    status: 'pending',
    votesFor: 2,
    votesAgainst: 1,
    voters: [
      { address: DAO_CONFIG.members[0].address, approved: true, timestamp: now - 86_400_000 },
      { address: DAO_CONFIG.members[1].address, approved: true, timestamp: now - 72_000_000 },
      { address: DAO_CONFIG.members[3].address, approved: false, timestamp: now - 48_000_000 },
    ],
    createdAt: now - 172_800_000,
    action: 'deploy-agent',
    params: { agentName: 'Treasury Ops v2', budget: '25000', runtime: 'vercel-edge' },
  },
  {
    id: 'intent-002',
    title: 'Increase Security Monitor spending cap',
    description:
      'Raise the daily spending limit for the Security Monitor agent from 1,000 USDC to 5,000 USDC to allow faster incident response without DAO approval.',
    proposer: DAO_CONFIG.members[2].address,
    status: 'approved',
    votesFor: 4,
    votesAgainst: 0,
    voters: [
      { address: DAO_CONFIG.members[0].address, approved: true, timestamp: now - 259_200_000 },
      { address: DAO_CONFIG.members[1].address, approved: true, timestamp: now - 240_000_000 },
      { address: DAO_CONFIG.members[2].address, approved: true, timestamp: now - 230_000_000 },
      { address: DAO_CONFIG.members[4].address, approved: true, timestamp: now - 220_000_000 },
    ],
    createdAt: now - 345_600_000,
    action: 'change-policy',
    params: { policyId: 'pol-security-monitor', rule: 'max-spend', newLimit: '5000' },
  },
  {
    id: 'intent-003',
    title: 'Transfer 10,000 USDC to external auditor',
    description:
      'Payment to ChainSafe for the Q1 smart-contract security audit. Invoice #CSF-2025-0042.',
    proposer: DAO_CONFIG.members[1].address,
    status: 'rejected',
    votesFor: 1,
    votesAgainst: 3,
    voters: [
      { address: DAO_CONFIG.members[1].address, approved: true, timestamp: now - 432_000_000 },
      { address: DAO_CONFIG.members[0].address, approved: false, timestamp: now - 420_000_000 },
      { address: DAO_CONFIG.members[3].address, approved: false, timestamp: now - 400_000_000 },
      { address: DAO_CONFIG.members[4].address, approved: false, timestamp: now - 380_000_000 },
    ],
    createdAt: now - 518_400_000,
    action: 'transfer-funds',
    params: { recipient: '0xAudit0r...', amount: '10000', token: 'USDC' },
  },
  {
    id: 'intent-004',
    title: 'Upgrade PermissionGate to v3',
    description:
      'Deploy a new PermissionGate implementation that supports batched rule evaluation. Reduces gas costs by approximately 40% for multi-rule policies.',
    proposer: DAO_CONFIG.members[4].address,
    status: 'completed',
    votesFor: 5,
    votesAgainst: 0,
    voters: DAO_CONFIG.members.map((m, i) => ({
      address: m.address,
      approved: true,
      timestamp: now - 600_000_000 + i * 3_600_000,
    })),
    createdAt: now - 604_800_000,
    action: 'upgrade-contract',
    params: { contract: 'PermissionGate', version: 'v3', audit: 'verified' },
  },
];

// ---- Hook ----

interface UseProposalsReturn {
  proposals: Proposal[];
  getProposal: (id: string) => Proposal | undefined;
  createProposal: (inv: Invariance, input: CreateProposalInput, proposerAddress: string) => Promise<Proposal>;
  vote: (inv: Invariance, proposalId: string, approve: boolean, reason?: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

export function useProposals(): UseProposalsReturn {
  const [proposals, setProposals] = useState<Proposal[]>(MOCK_PROPOSALS);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getProposal = useCallback(
    (id: string) => proposals.find((p) => p.id === id),
    [proposals],
  );

  const createProposal = useCallback(
    async (inv: Invariance, input: CreateProposalInput, proposerAddress: string): Promise<Proposal> => {
      setIsLoading(true);
      setError(null);

      try {
        // SDK call -- will throw TODO in dev since contracts are not deployed
        const result = await inv.intent.request({
          actor: { type: 'human', address: proposerAddress },
          action: input.action,
          params: {
            ...input.params,
            title: input.title,
            description: input.description,
          },
          approval: 'multi-sig',
        });

        const proposal: Proposal = {
          id: result.intentId,
          title: input.title,
          description: input.description,
          proposer: proposerAddress,
          status: 'pending',
          votesFor: 0,
          votesAgainst: 0,
          voters: [],
          createdAt: Date.now(),
          action: input.action,
          params: input.params,
        };

        setProposals((prev) => [proposal, ...prev]);

        // Also log to the on-chain audit trail
        try {
          await inv.ledger.log({
            action: 'proposal-created',
            actor: { type: 'human', address: proposerAddress },
            category: 'custom',
            metadata: { proposalId: proposal.id, title: input.title },
          });
        } catch {
          // Ledger logging is best-effort
        }

        return proposal;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create proposal';
        setError(message);

        // Fallback: insert a local-only proposal so the UI still works
        const fallback: Proposal = {
          id: `intent-local-${Date.now()}`,
          title: input.title,
          description: input.description,
          proposer: proposerAddress,
          status: 'pending',
          votesFor: 0,
          votesAgainst: 0,
          voters: [],
          createdAt: Date.now(),
          action: input.action,
          params: input.params,
        };
        setProposals((prev) => [fallback, ...prev]);
        return fallback;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const vote = useCallback(
    async (inv: Invariance, proposalId: string, approve: boolean, reason?: string) => {
      setIsLoading(true);
      setError(null);

      try {
        if (approve) {
          await inv.intent.approve(proposalId);
        } else {
          await inv.intent.reject(proposalId, reason);
        }

        // Refresh status
        const status: IntentStatus = await inv.intent.status(proposalId);

        setProposals((prev) =>
          prev.map((p) => {
            if (p.id !== proposalId) return p;
            return {
              ...p,
              status: status.lifecycle,
              votesFor: status.approvals?.signers.filter((s) => s.approved).length ?? p.votesFor,
              votesAgainst: status.approvals?.signers.filter((s) => !s.approved).length ?? p.votesAgainst,
              voters:
                status.approvals?.signers.map((s) => ({
                  address: s.address,
                  approved: s.approved,
                  timestamp: s.timestamp ?? Date.now(),
                })) ?? p.voters,
            };
          }),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to submit vote';
        setError(message);

        // Optimistic fallback so the demo still responds
        setProposals((prev) =>
          prev.map((p) => {
            if (p.id !== proposalId) return p;
            const updatedFor = p.votesFor + (approve ? 1 : 0);
            const updatedAgainst = p.votesAgainst + (approve ? 0 : 1);
            return {
              ...p,
              votesFor: updatedFor,
              votesAgainst: updatedAgainst,
              voters: [
                ...p.voters,
                { address: '0xYou', approved: approve, timestamp: Date.now() },
              ],
            };
          }),
        );
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  return { proposals, getProposal, createProposal, vote, isLoading, error };
}
