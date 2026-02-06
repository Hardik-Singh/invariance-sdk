/**
 * Static configuration for the Invariance AI Collective DAO.
 *
 * These values mirror what would be stored on-chain after the DAO is
 * bootstrapped via `inv.policy.create()` and `inv.escrow.create()`.
 */

export interface DaoMember {
  address: string;
  label: string;
  role: 'founder' | 'member' | 'observer';
}

export interface DaoAgent {
  id: string;
  name: string;
  description: string;
  address: string;
  policyId: string;
  status: 'active' | 'paused' | 'proposed';
  spentUSDC: string;
  limitUSDC: string;
  allowedActions: string[];
  lastActive: number;
}

export const DAO_CONFIG = {
  /** Display name shown in the header & dashboard */
  name: 'Invariance AI Collective',

  /** Minimum voters needed for a quorum */
  quorum: 3,

  /** Approval threshold in basis points (60 %) */
  threshold: 6000,

  /** How long a proposal stays open for voting */
  votingPeriod: '7d',

  /** Treasury seed amount in USDC */
  treasuryAmount: '50000',

  /** DAO multisig address (stand-in) */
  daoAddress: '0xDA0DA0DA0DA0DA0DA0DA0DA0DA0DA0DA0DA0DA0D',

  /** Registered DAO members */
  members: [
    { address: '0x1111111111111111111111111111111111111111', label: 'Alice', role: 'founder' },
    { address: '0x2222222222222222222222222222222222222222', label: 'Bob', role: 'member' },
    { address: '0x3333333333333333333333333333333333333333', label: 'Charlie', role: 'member' },
    { address: '0x4444444444444444444444444444444444444444', label: 'Diana', role: 'member' },
    { address: '0x5555555555555555555555555555555555555555', label: 'Eve', role: 'member' },
  ] satisfies DaoMember[],

  /** Pre-configured DAO-managed agents (demo data) */
  agents: [
    {
      id: 'agent-treasury-ops',
      name: 'Treasury Ops Agent',
      description: 'Manages routine treasury operations: payroll, rebalancing, and yield farming within approved limits.',
      address: '0xA111111111111111111111111111111111111111',
      policyId: 'pol-treasury-ops',
      status: 'active',
      spentUSDC: '12400',
      limitUSDC: '25000',
      allowedActions: ['transfer-funds', 'rebalance-portfolio', 'claim-yield'],
      lastActive: Date.now() - 3_600_000,
    },
    {
      id: 'agent-security-monitor',
      name: 'Security Monitor',
      description: 'Continuously monitors on-chain activity for anomalies and can pause suspicious agents.',
      address: '0xA222222222222222222222222222222222222222',
      policyId: 'pol-security-monitor',
      status: 'active',
      spentUSDC: '320',
      limitUSDC: '1000',
      allowedActions: ['pause-agent', 'flag-transaction', 'alert-members'],
      lastActive: Date.now() - 600_000,
    },
    {
      id: 'agent-research',
      name: 'Research Analyst',
      description: 'Gathers and summarises market data for DAO decision-making. Read-only chain access.',
      address: '0xA333333333333333333333333333333333333333',
      policyId: 'pol-research',
      status: 'paused',
      spentUSDC: '0',
      limitUSDC: '500',
      allowedActions: ['query-data', 'publish-report'],
      lastActive: Date.now() - 86_400_000,
    },
  ] satisfies DaoAgent[],
} as const;

/** Action types that can be proposed */
export const PROPOSAL_ACTIONS = [
  { value: 'deploy-agent', label: 'Deploy New Agent' },
  { value: 'change-policy', label: 'Change Policy' },
  { value: 'transfer-funds', label: 'Transfer Funds' },
  { value: 'upgrade-contract', label: 'Upgrade Contract' },
] as const;

export type ProposalActionType = (typeof PROPOSAL_ACTIONS)[number]['value'];
