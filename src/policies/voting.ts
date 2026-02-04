import type {
  ActionInput,
  PolicyCheckResult,
  VotingPolicy,
  VotingConfig,
  MultiSigConfig,
  DAOVotingConfig,
  ThresholdConfig,
  ActorType,
  ActionCategory,
} from '@invariance/common';
import { DEFAULT_POLICY_VALUES } from '@invariance/common';
import type { AsyncExecutionPolicy } from './types.js';

/**
 * Represents a vote from a participant.
 */
export interface Vote {
  /** Address of the voter */
  voter: string;
  /** Whether they approved */
  approved: boolean;
  /** Signature or proof of vote (for verification) */
  signature?: string;
  /** Token-weighted vote power (for DAO mode) */
  votePower?: bigint;
  /** Timestamp of the vote */
  timestamp: number;
}

/**
 * Represents a voting proposal for an action.
 */
export interface Proposal {
  /** Unique proposal identifier */
  id: string;
  /** The action being voted on */
  action: ActionInput;
  /** Collected votes */
  votes: Vote[];
  /** When the proposal was created */
  createdAt: number;
  /** When the proposal expires */
  expiresAt: number;
  /** Current status */
  status: 'pending' | 'approved' | 'rejected' | 'expired';
}

/**
 * Callback for collecting votes on a proposal.
 */
export type VoteRequestCallback = (proposal: Proposal) => Promise<Vote[]>;

/**
 * Options for creating a voting policy.
 */
export interface VotingOptions {
  /** Voting configuration (multi-sig, DAO, or threshold) */
  config: VotingConfig;
  /** Action types that require voting (empty = all actions) */
  requiredForActions?: string[];

  // NEW OPTIONAL FIELDS (v2.0)
  /** Policy version (default: "1.0.0") */
  version?: string;
  /** Max gas per action (default: 5_000_000n) */
  maxGas?: bigint;
  /** Max value per action (default: unlimited) */
  maxValue?: bigint;
  /** Allowed actor types (default: ['any']) */
  allowedActors?: ActorType[];
  /** Action category (default: 'CUSTOM') */
  category?: ActionCategory;
  /** Cooldown between same-category actions in seconds (default: 300) */
  cooldownSeconds?: number;
}

/**
 * Voting policy - requires consensus before action execution.
 * Supports multi-sig, DAO-style, and threshold voting modes.
 *
 * @example
 * ```typescript
 * // Multi-sig: 2-of-3 signers required
 * const voting = new Voting({
 *   config: {
 *     mode: 'multi-sig',
 *     requiredSignatures: 2,
 *     totalSigners: 3,
 *     signers: ['0x...', '0x...', '0x...'],
 *     expirationPeriod: 86400, // 24 hours
 *   },
 *   requiredForActions: ['transfer', 'withdraw'],
 * });
 *
 * voting.onVoteRequest(async (proposal) => {
 *   // Collect signatures from signers
 *   return collectedVotes;
 * });
 * ```
 */
export class Voting implements AsyncExecutionPolicy {
  readonly type = 'voting';
  readonly requiresAsync = true;

  private readonly config: VotingConfig;
  private readonly requiredForActions: string[];
  private readonly policyFields: {
    version: string;
    maxGas: bigint;
    maxValue: bigint;
    allowedActors: ActorType[];
    category: ActionCategory;
    cooldownSeconds: number;
  };
  private active = true;
  private proposals: Map<string, Proposal> = new Map();
  private voteRequestCallback: VoteRequestCallback | null = null;
  private proposalCounter = 0;

  constructor(options: VotingOptions) {
    this.validateConfig(options.config);
    this.config = options.config;
    this.requiredForActions = options.requiredForActions ?? [];
    this.policyFields = {
      version: options.version ?? DEFAULT_POLICY_VALUES.version,
      maxGas: options.maxGas ?? DEFAULT_POLICY_VALUES.maxGas,
      maxValue: options.maxValue ?? DEFAULT_POLICY_VALUES.maxValue,
      allowedActors: options.allowedActors ?? DEFAULT_POLICY_VALUES.allowedActors,
      category: options.category ?? DEFAULT_POLICY_VALUES.category,
      cooldownSeconds: options.cooldownSeconds ?? DEFAULT_POLICY_VALUES.cooldownSeconds,
    };
  }

  /**
   * Check if this policy is active.
   */
  isActive(): boolean {
    return this.active;
  }

  /**
   * Enable or disable this policy.
   */
  setActive(active: boolean): void {
    this.active = active;
  }

  /**
   * Register a callback for vote collection.
   * This callback is invoked when checkAsync needs to collect votes.
   *
   * @param callback - Function to collect votes for a proposal
   */
  onVoteRequest(callback: VoteRequestCallback): void {
    this.voteRequestCallback = callback;
  }

  /**
   * Synchronous check - returns false if voting is required.
   * Use checkAsync for the full voting flow.
   */
  check(action: ActionInput): PolicyCheckResult {
    if (!this.active) {
      return { allowed: true };
    }

    // Check if this action type requires voting
    if (!this.actionRequiresVoting(action)) {
      return { allowed: true };
    }

    // Sync check: voting required, cannot proceed without async
    return {
      allowed: false,
      reason: 'Action requires voting approval. Use checkAsync() for voting flow.',
    };
  }

  /**
   * Asynchronously check policy by initiating voting.
   *
   * @param action - The action to vote on
   * @returns Policy check result after voting completes
   */
  async checkAsync(action: ActionInput): Promise<PolicyCheckResult> {
    if (!this.active) {
      return { allowed: true };
    }

    // Check if this action type requires voting
    if (!this.actionRequiresVoting(action)) {
      return { allowed: true };
    }

    // Check for existing approved proposal
    const existingProposal = this.findApprovedProposal(action);
    if (existingProposal) {
      return { allowed: true };
    }

    // Create new proposal
    const proposal = this.createProposal(action);

    // Collect votes via callback
    if (!this.voteRequestCallback) {
      return {
        allowed: false,
        reason: 'No vote request callback registered. Call onVoteRequest() first.',
      };
    }

    try {
      const votes = await this.voteRequestCallback(proposal);
      this.recordVotes(proposal.id, votes);

      // Check if proposal is now approved
      if (this.isProposalApproved(proposal.id)) {
        return { allowed: true };
      }

      return {
        allowed: false,
        reason: `Voting did not reach required consensus`,
      };
    } catch (error) {
      return {
        allowed: false,
        reason: `Vote collection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Create a new proposal for an action.
   *
   * @param action - The action to create a proposal for
   * @returns The created proposal
   */
  createProposal(action: ActionInput): Proposal {
    const now = Date.now();
    const expirationPeriod = this.getExpirationPeriod();

    const proposal: Proposal = {
      id: `proposal-${++this.proposalCounter}`,
      action,
      votes: [],
      createdAt: now,
      expiresAt: now + expirationPeriod * 1000,
      status: 'pending',
    };

    this.proposals.set(proposal.id, proposal);
    return proposal;
  }

  /**
   * Record votes for a proposal.
   *
   * @param proposalId - The proposal ID
   * @param votes - Votes to record
   */
  recordVotes(proposalId: string, votes: Vote[]): void {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      throw new Error(`Proposal not found: ${proposalId}`);
    }

    // Check expiration
    if (Date.now() > proposal.expiresAt) {
      proposal.status = 'expired';
      return;
    }

    // Validate and add votes
    for (const vote of votes) {
      if (this.isValidVoter(vote.voter)) {
        // Prevent duplicate votes
        const existingVote = proposal.votes.find((v) => v.voter === vote.voter);
        if (!existingVote) {
          proposal.votes.push(vote);
        }
      }
    }

    // Update status
    if (this.checkApproval(proposal)) {
      proposal.status = 'approved';
    } else if (this.checkRejection(proposal)) {
      proposal.status = 'rejected';
    }
  }

  /**
   * Check if a proposal has been approved.
   *
   * @param proposalId - The proposal ID
   * @returns True if the proposal is approved
   */
  isProposalApproved(proposalId: string): boolean {
    const proposal = this.proposals.get(proposalId);
    return proposal?.status === 'approved';
  }

  /**
   * Get a proposal by ID.
   *
   * @param proposalId - The proposal ID
   * @returns The proposal or undefined
   */
  getProposal(proposalId: string): Proposal | undefined {
    return this.proposals.get(proposalId);
  }

  /**
   * Convert to policy config format.
   */
  toPolicy(): VotingPolicy {
    return {
      id: `voting-${this.config.mode}`,
      type: 'voting',
      active: this.active,
      config: this.config,
      requiredForActions: this.requiredForActions,
      version: this.policyFields.version,
      maxGas: this.policyFields.maxGas,
      maxValue: this.policyFields.maxValue,
      allowedActors: this.policyFields.allowedActors,
      category: this.policyFields.category,
      cooldownSeconds: this.policyFields.cooldownSeconds,
    };
  }

  /**
   * @deprecated Use toPolicy() instead
   */
  toPermission(): VotingPolicy {
    return this.toPolicy();
  }

  /**
   * Validate the voting configuration.
   */
  private validateConfig(config: VotingConfig): void {
    switch (config.mode) {
      case 'multi-sig':
        this.validateMultiSigConfig(config);
        break;
      case 'dao':
        this.validateDAOConfig(config);
        break;
      case 'threshold':
        this.validateThresholdConfig(config);
        break;
    }
  }

  private validateMultiSigConfig(config: MultiSigConfig): void {
    if (config.requiredSignatures <= 0) {
      throw new Error('requiredSignatures must be positive');
    }
    if (config.requiredSignatures > config.totalSigners) {
      throw new Error('requiredSignatures cannot exceed totalSigners');
    }
    if (config.signers.length !== config.totalSigners) {
      throw new Error('signers array length must match totalSigners');
    }
    if (config.expirationPeriod <= 0) {
      throw new Error('expirationPeriod must be positive');
    }
  }

  private validateDAOConfig(config: DAOVotingConfig): void {
    if (config.quorumBps < 0 || config.quorumBps > 10000) {
      throw new Error('quorumBps must be between 0 and 10000');
    }
    if (config.approvalThresholdBps < 0 || config.approvalThresholdBps > 10000) {
      throw new Error('approvalThresholdBps must be between 0 and 10000');
    }
    if (config.votingPeriod <= 0) {
      throw new Error('votingPeriod must be positive');
    }
  }

  private validateThresholdConfig(config: ThresholdConfig): void {
    if (config.thresholdBps < 0 || config.thresholdBps > 10000) {
      throw new Error('thresholdBps must be between 0 and 10000');
    }
    if (config.voters.length === 0) {
      throw new Error('voters array cannot be empty');
    }
    if (config.votingPeriod <= 0) {
      throw new Error('votingPeriod must be positive');
    }
  }

  /**
   * Check if an action type requires voting.
   */
  private actionRequiresVoting(action: ActionInput): boolean {
    // Empty array = all actions require voting
    if (this.requiredForActions.length === 0) {
      return true;
    }

    return this.requiredForActions.some((pattern) => {
      if (pattern.endsWith('*')) {
        return action.type.startsWith(pattern.slice(0, -1));
      }
      return action.type === pattern;
    });
  }

  /**
   * Find an existing approved proposal for an action.
   */
  private findApprovedProposal(action: ActionInput): Proposal | undefined {
    for (const proposal of this.proposals.values()) {
      if (
        proposal.status === 'approved' &&
        proposal.action.type === action.type &&
        JSON.stringify(proposal.action.params) === JSON.stringify(action.params) &&
        Date.now() <= proposal.expiresAt
      ) {
        return proposal;
      }
    }
    return undefined;
  }

  /**
   * Get the expiration period based on config mode.
   */
  private getExpirationPeriod(): number {
    switch (this.config.mode) {
      case 'multi-sig':
        return this.config.expirationPeriod;
      case 'dao':
        return this.config.votingPeriod + this.config.timelockDelay;
      case 'threshold':
        return this.config.votingPeriod;
    }
  }

  /**
   * Check if a voter is valid for the current config.
   */
  private isValidVoter(voter: string): boolean {
    switch (this.config.mode) {
      case 'multi-sig':
        return this.config.signers.includes(voter);
      case 'dao':
        // DAO mode: any token holder can vote
        return true;
      case 'threshold':
        return this.config.voters.includes(voter);
    }
  }

  /**
   * Check if a proposal meets approval criteria.
   */
  private checkApproval(proposal: Proposal): boolean {
    const approvals = proposal.votes.filter((v) => v.approved);

    switch (this.config.mode) {
      case 'multi-sig':
        return approvals.length >= this.config.requiredSignatures;

      case 'dao': {
        // Calculate total vote power and approval power
        const totalVotePower = proposal.votes.reduce(
          (sum, v) => sum + (v.votePower ?? 0n),
          0n,
        );
        const approvalPower = approvals.reduce(
          (sum, v) => sum + (v.votePower ?? 0n),
          0n,
        );

        // Check quorum and approval threshold
        // Note: In a real implementation, you'd check against total token supply
        if (totalVotePower === 0n) return false;

        const approvalBps = (approvalPower * 10000n) / totalVotePower;
        return approvalBps >= BigInt(this.config.approvalThresholdBps);
      }

      case 'threshold': {
        const totalVoters = this.config.voters.length;
        const approvalBps = (approvals.length * 10000) / totalVoters;
        return approvalBps >= this.config.thresholdBps;
      }
    }
  }

  /**
   * Check if a proposal has been definitively rejected.
   */
  private checkRejection(proposal: Proposal): boolean {
    const rejections = proposal.votes.filter((v) => !v.approved);

    switch (this.config.mode) {
      case 'multi-sig': {
        // Rejected if remaining possible approvals can't reach threshold
        const remainingVoters =
          this.config.totalSigners - proposal.votes.length;
        const currentApprovals = proposal.votes.filter((v) => v.approved).length;
        return currentApprovals + remainingVoters < this.config.requiredSignatures;
      }

      case 'dao':
        // DAO voting is typically time-bound, not early rejection
        return false;

      case 'threshold': {
        const totalVoters = this.config.voters.length;
        const rejectionBps = (rejections.length * 10000) / totalVoters;
        return rejectionBps > 10000 - this.config.thresholdBps;
      }
    }
  }
}
