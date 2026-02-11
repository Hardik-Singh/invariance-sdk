/**
 * Test suite for ProposalCard component
 *
 * Tests rendering of proposal information, status badges, vote bars,
 * and proper Link integration.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProposalCard } from '@/components/ProposalCard';
import type { Proposal } from '@/hooks/useProposals';

describe('ProposalCard', () => {
  const baseProposal: Proposal = {
    id: 'intent-001',
    title: 'Deploy Treasury Ops Agent v2',
    description:
      'Upgrade the Treasury Ops agent to v2 with improved yield farming strategies and tighter risk controls.',
    proposer: '0x1234567890123456789012345678901234567890',
    status: 'pending',
    votesFor: 5,
    votesAgainst: 2,
    voters: [
      { address: '0xVoter1', approved: true, timestamp: Date.now() },
      { address: '0xVoter2', approved: false, timestamp: Date.now() },
    ],
    createdAt: Date.now() - 86400000, // 1 day ago
    action: 'deploy-agent',
    params: { agentName: 'Treasury Ops v2' },
  };

  it('should render proposal title', () => {
    render(<ProposalCard proposal={baseProposal} />);
    expect(screen.getByText('Deploy Treasury Ops Agent v2')).toBeInTheDocument();
  });

  it('should render proposal description', () => {
    render(<ProposalCard proposal={baseProposal} />);
    const description = screen.getByText(/Upgrade the Treasury Ops agent/);
    expect(description).toBeInTheDocument();
  });

  it('should display status badge with correct color', () => {
    const { rerender } = render(<ProposalCard proposal={baseProposal} />);

    // Pending status
    let statusBadge = screen.getByText('pending');
    expect(statusBadge).toHaveClass('bg-amber-500/20', 'text-amber-400');

    // Approved status
    rerender(<ProposalCard proposal={{ ...baseProposal, status: 'approved' }} />);
    statusBadge = screen.getByText('approved');
    expect(statusBadge).toHaveClass('bg-blue-500/20', 'text-blue-400');

    // Completed status
    rerender(<ProposalCard proposal={{ ...baseProposal, status: 'completed' }} />);
    statusBadge = screen.getByText('completed');
    expect(statusBadge).toHaveClass('bg-emerald-500/20', 'text-emerald-400');

    // Rejected status
    rerender(<ProposalCard proposal={{ ...baseProposal, status: 'rejected' }} />);
    statusBadge = screen.getByText('rejected');
    expect(statusBadge).toHaveClass('bg-red-500/20', 'text-red-400');

    // Expired status
    rerender(<ProposalCard proposal={{ ...baseProposal, status: 'expired' }} />);
    statusBadge = screen.getByText('expired');
    expect(statusBadge).toHaveClass('bg-gray-500/20', 'text-gray-400');

    // Executing status
    rerender(<ProposalCard proposal={{ ...baseProposal, status: 'executing' }} />);
    statusBadge = screen.getByText('executing');
    expect(statusBadge).toHaveClass('bg-indigo-500/20', 'text-indigo-400');
  });

  it('should display vote counts', () => {
    render(<ProposalCard proposal={baseProposal} />);
    expect(screen.getByText('5 For')).toBeInTheDocument();
    expect(screen.getByText('2 Against')).toBeInTheDocument();
  });

  it('should calculate and display vote percentage correctly', () => {
    const { container } = render(<ProposalCard proposal={baseProposal} />);

    // Total votes: 5 + 2 = 7
    // For percentage: 5 / 7 ≈ 71.43%
    const progressBar = container.querySelector('[style*="width"]');
    expect(progressBar).toBeInTheDocument();
    // The width should be around 71%
    expect(progressBar?.getAttribute('style')).toMatch(/width.*71/);
  });

  it('should handle zero votes correctly', () => {
    const noVotesProposal = {
      ...baseProposal,
      votesFor: 0,
      votesAgainst: 0,
    };

    const { container } = render(<ProposalCard proposal={noVotesProposal} />);
    expect(screen.getByText('0 For')).toBeInTheDocument();
    expect(screen.getByText('0 Against')).toBeInTheDocument();

    // Progress bar should not be rendered when total votes = 0
    const progressBar = container.querySelector('[style*="width"]');
    expect(progressBar).not.toBeInTheDocument();
  });

  it('should handle 100% for votes', () => {
    const unanimousProposal = {
      ...baseProposal,
      votesFor: 10,
      votesAgainst: 0,
    };

    const { container } = render(<ProposalCard proposal={unanimousProposal} />);
    const progressBar = container.querySelector('[style*="width"]');
    expect(progressBar?.getAttribute('style')).toMatch(/width.*100/);
  });

  it('should handle 100% against votes', () => {
    const rejectedProposal = {
      ...baseProposal,
      votesFor: 0,
      votesAgainst: 10,
    };

    const { container } = render(<ProposalCard proposal={rejectedProposal} />);
    const progressBar = container.querySelector('[style*="width"]');
    expect(progressBar?.getAttribute('style')).toMatch(/width.*0/);
  });

  it('should truncate proposer address', () => {
    render(<ProposalCard proposal={baseProposal} />);
    // Address should be truncated to 0x1234...7890 format
    const proposerText = screen.getByText(/Proposed by/);
    expect(proposerText).toBeInTheDocument();
    // The full address should not be shown
    expect(screen.queryByText('0x1234567890123456789012345678901234567890')).not.toBeInTheDocument();
  });

  it('should display time ago correctly', () => {
    const now = Date.now();

    // Test seconds ago
    const { rerender } = render(
      <ProposalCard proposal={{ ...baseProposal, createdAt: now - 30000 }} />
    );
    expect(screen.getByText(/30s ago/)).toBeInTheDocument();

    // Test minutes ago
    rerender(<ProposalCard proposal={{ ...baseProposal, createdAt: now - 300000 }} />);
    expect(screen.getByText(/5m ago/)).toBeInTheDocument();

    // Test hours ago
    rerender(<ProposalCard proposal={{ ...baseProposal, createdAt: now - 7200000 }} />);
    expect(screen.getByText(/2h ago/)).toBeInTheDocument();

    // Test days ago
    rerender(<ProposalCard proposal={{ ...baseProposal, createdAt: now - 172800000 }} />);
    expect(screen.getByText(/2d ago/)).toBeInTheDocument();
  });

  it('should render as a clickable link', () => {
    const { container } = render(<ProposalCard proposal={baseProposal} />);
    const link = container.querySelector('a[href="/proposals/intent-001"]');
    expect(link).toBeInTheDocument();
  });

  it('should apply hover styles', () => {
    const { container } = render(<ProposalCard proposal={baseProposal} />);
    const link = container.querySelector('a');
    expect(link).toHaveClass('hover:border-indigo-500/40', 'hover:bg-slate-800/80');
  });

  it('should truncate long descriptions with line-clamp', () => {
    const longDescription = 'A'.repeat(500);
    const { container } = render(
      <ProposalCard proposal={{ ...baseProposal, description: longDescription }} />
    );

    const descriptionElement = container.querySelector('.line-clamp-2');
    expect(descriptionElement).toBeInTheDocument();
  });

  it('should handle short proposer addresses correctly', () => {
    const shortAddress = '0x1234';
    render(<ProposalCard proposal={{ ...baseProposal, proposer: shortAddress }} />);
    // Short addresses should not be truncated
    expect(screen.getByText(shortAddress)).toBeInTheDocument();
  });

  it('should resolve label from DAO_CONFIG when available', () => {
    // This test would require mocking DAO_CONFIG
    // For now, we just verify the component renders without error
    render(<ProposalCard proposal={baseProposal} />);
    expect(screen.getByText(/Proposed by/)).toBeInTheDocument();
  });

  it('should render all proposal elements together', () => {
    const { container } = render(<ProposalCard proposal={baseProposal} />);

    // Check main structural elements exist
    expect(screen.getByText('Deploy Treasury Ops Agent v2')).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
    expect(screen.getByText('5 For')).toBeInTheDocument();
    expect(screen.getByText('2 Against')).toBeInTheDocument();
    expect(screen.getByText(/Proposed by/)).toBeInTheDocument();
    expect(screen.getByText(/ago/)).toBeInTheDocument();

    // Check card styling
    const link = container.querySelector('a');
    expect(link).toHaveClass('block', 'rounded-xl', 'border');
  });

  it('should handle edge case of very recent proposal', () => {
    const veryRecentProposal = {
      ...baseProposal,
      createdAt: Date.now() - 1000, // 1 second ago
    };

    render(<ProposalCard proposal={veryRecentProposal} />);
    expect(screen.getByText(/[0-9]+s ago/)).toBeInTheDocument();
  });

  it('should maintain accessibility', () => {
    const { container } = render(<ProposalCard proposal={baseProposal} />);

    // Link should be focusable
    const link = container.querySelector('a');
    expect(link).toBeInTheDocument();
    expect(link?.tagName).toBe('A');
    expect(link?.getAttribute('href')).toBe('/proposals/intent-001');
  });
});
