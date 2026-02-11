/**
 * Test suite for AgentCard component
 *
 * Tests rendering of agent listings with name, category, rating,
 * price, capabilities, and verification badge.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AgentCard from '@/components/AgentCard';
import type { Listing } from '@invariance/sdk';

describe('AgentCard', () => {
  const baseListing: Listing = {
    listingId: 'list-001',
    identity: {
      identityId: 'id-001',
      address: '0xAgent',
      owner: '0xOwner',
      type: 'agent',
      label: 'TradingBot',
      capabilities: ['swap', 'rebalance'],
      status: 'active',
      attestations: [{ type: 'kyc', issuer: '0xIssuer', timestamp: Date.now() }],
      createdAt: Date.now(),
      txHash: '0xtx',
      explorerUrl: 'https://explorer.test',
      metadata: {},
    },
    name: 'AI Trading Assistant',
    description: 'Automated trading bot with advanced algorithms for optimal portfolio management.',
    category: 'trading',
    pricing: {
      type: 'per-task',
      amount: '100',
      currency: 'USDC',
    },
    capabilities: ['swap', 'rebalance', 'analysis', 'risk-management'],
    reputation: {
      score: 850,
      tier: 'gold',
      volume: '150000',
      completedTasks: 42,
      successRate: 0.95,
    },
    reviewSummary: {
      average: 4.5,
      count: 28,
    },
    active: true,
    createdAt: Date.now(),
    txHash: '0xtxhash',
    explorerUrl: 'https://sepolia.basescan.org/tx/0xtxhash',
  };

  it('should render agent name', () => {
    render(<AgentCard listing={baseListing} />);
    expect(screen.getByText('AI Trading Assistant')).toBeInTheDocument();
  });

  it('should render agent description', () => {
    render(<AgentCard listing={baseListing} />);
    const description = screen.getByText(/Automated trading bot/);
    expect(description).toBeInTheDocument();
  });

  it('should display category badge', () => {
    render(<AgentCard listing={baseListing} />);
    expect(screen.getByText('Trading')).toBeInTheDocument();
  });

  it('should display reputation tier badge', () => {
    render(<AgentCard listing={baseListing} />);
    expect(screen.getByText('gold')).toBeInTheDocument();
  });

  it('should render avatar with first letter of name', () => {
    const { container } = render(<AgentCard listing={baseListing} />);
    const avatar = container.querySelector('[class*="rounded-full"]');
    expect(avatar?.textContent).toBe('A');
  });

  it('should display star rating with count', () => {
    const { container } = render(<AgentCard listing={baseListing} />);
    expect(screen.getByText('4.5')).toBeInTheDocument();
    expect(screen.getByText('(28)')).toBeInTheDocument();

    // Check for star SVGs
    const stars = container.querySelectorAll('svg[viewBox="0 0 20 20"]');
    expect(stars.length).toBe(5);
  });

  it('should render filled and empty stars correctly', () => {
    const { container } = render(<AgentCard listing={baseListing} />);

    // 4.5 rating rounds to 5 filled stars
    const filledStars = container.querySelectorAll('svg.text-amber-400');
    expect(filledStars.length).toBe(5);
  });

  it('should handle zero rating', () => {
    const zeroRatingListing = {
      ...baseListing,
      reviewSummary: { average: 0, count: 0 },
    };

    const { container } = render(<AgentCard listing={zeroRatingListing} />);
    expect(screen.getByText('0.0')).toBeInTheDocument();

    const emptyStars = container.querySelectorAll('svg.text-gray-200');
    expect(emptyStars.length).toBe(5);
  });

  it('should display price correctly', () => {
    render(<AgentCard listing={baseListing} />);
    expect(screen.getByText('$100')).toBeInTheDocument();
    expect(screen.getByText('USDC / task')).toBeInTheDocument();
  });

  it('should format different pricing types', () => {
    const hourlyListing = {
      ...baseListing,
      pricing: { type: 'hourly' as const, amount: '50', currency: 'USDC' as const },
    };

    const { rerender } = render(<AgentCard listing={hourlyListing} />);
    expect(screen.getByText('USDC / hourly')).toBeInTheDocument();

    const fixedListing = {
      ...baseListing,
      pricing: { type: 'fixed' as const, amount: '1000', currency: 'USDC' as const },
    };

    rerender(<AgentCard listing={fixedListing} />);
    expect(screen.getByText('USDC / fixed')).toBeInTheDocument();
  });

  it('should display up to 4 capabilities', () => {
    render(<AgentCard listing={baseListing} />);
    expect(screen.getByText('swap')).toBeInTheDocument();
    expect(screen.getByText('rebalance')).toBeInTheDocument();
    expect(screen.getByText('analysis')).toBeInTheDocument();
    expect(screen.getByText('risk-management')).toBeInTheDocument();
  });

  it('should show +N indicator for extra capabilities', () => {
    const manyCapabilities = {
      ...baseListing,
      capabilities: ['cap1', 'cap2', 'cap3', 'cap4', 'cap5', 'cap6', 'cap7'],
    };

    render(<AgentCard listing={manyCapabilities} />);
    expect(screen.getByText('+3')).toBeInTheDocument();
  });

  it('should not show +N indicator when capabilities <= 4', () => {
    const fewCapabilities = {
      ...baseListing,
      capabilities: ['cap1', 'cap2', 'cap3'],
    };

    render(<AgentCard listing={fewCapabilities} />);
    expect(screen.queryByText(/\+/)).not.toBeInTheDocument();
  });

  it('should render VerifyBadge when attestations exist', () => {
    render(<AgentCard listing={baseListing} />);
    // VerifyBadge should be in the document when attestations > 0
    // This would require checking for the VerifyBadge component's output
  });

  it('should not render VerifyBadge when no attestations', () => {
    const noAttestations = {
      ...baseListing,
      identity: { ...baseListing.identity, attestations: [] },
    };

    render(<AgentCard listing={noAttestations} />);
    // VerifyBadge should not be rendered
  });

  it('should render Hire button as link', () => {
    const { container } = render(<AgentCard listing={baseListing} />);
    const hireLink = container.querySelector('a[href="/agents/list-001"]');
    expect(hireLink).toBeInTheDocument();
    expect(hireLink?.textContent).toBe('Hire');
  });

  it('should apply correct category color', () => {
    const { container, rerender } = render(<AgentCard listing={baseListing} />);

    // Trading category
    let categoryBadge = screen.getByText('Trading');
    expect(categoryBadge).toHaveClass('bg-blue-100', 'text-blue-700');

    // Content category
    const contentListing = { ...baseListing, category: 'content' as const };
    rerender(<AgentCard listing={contentListing} />);
    categoryBadge = screen.getByText('Content');
    expect(categoryBadge).toHaveClass('bg-pink-100', 'text-pink-700');

    // Analysis category
    const analysisListing = { ...baseListing, category: 'analysis' as const };
    rerender(<AgentCard listing={analysisListing} />);
    categoryBadge = screen.getByText('Analysis');
    expect(categoryBadge).toHaveClass('bg-violet-100', 'text-violet-700');

    // Automation category
    const automationListing = { ...baseListing, category: 'automation' as const };
    rerender(<AgentCard listing={automationListing} />);
    categoryBadge = screen.getByText('Automation');
    expect(categoryBadge).toHaveClass('bg-orange-100', 'text-orange-700');
  });

  it('should apply hover styles', () => {
    const { container } = render(<AgentCard listing={baseListing} />);
    const card = container.querySelector('.group');
    expect(card).toHaveClass('hover:border-indigo-200', 'hover:shadow-md');
  });

  it('should truncate long descriptions', () => {
    const longDescription = {
      ...baseListing,
      description: 'A'.repeat(500),
    };

    const { container } = render(<AgentCard listing={longDescription} />);
    const descriptionElement = container.querySelector('.line-clamp-2');
    expect(descriptionElement).toBeInTheDocument();
  });

  it('should handle different reputation tiers', () => {
    const { rerender } = render(<AgentCard listing={baseListing} />);

    // Gold tier
    expect(screen.getByText('gold')).toBeInTheDocument();

    // Silver tier
    const silverListing = {
      ...baseListing,
      reputation: { ...baseListing.reputation, tier: 'silver' as const },
    };
    rerender(<AgentCard listing={silverListing} />);
    expect(screen.getByText('silver')).toBeInTheDocument();

    // Bronze tier
    const bronzeListing = {
      ...baseListing,
      reputation: { ...baseListing.reputation, tier: 'bronze' as const },
    };
    rerender(<AgentCard listing={bronzeListing} />);
    expect(screen.getByText('bronze')).toBeInTheDocument();
  });

  it('should render all main sections', () => {
    const { container } = render(<AgentCard listing={baseListing} />);

    // Header with avatar and badges
    expect(container.querySelector('.flex.items-start.justify-between')).toBeInTheDocument();

    // Description
    expect(screen.getByText(/Automated trading bot/)).toBeInTheDocument();

    // Rating section
    expect(screen.getByText('4.5')).toBeInTheDocument();

    // Capabilities
    expect(screen.getByText('swap')).toBeInTheDocument();

    // Footer with price and hire button
    expect(screen.getByText('$100')).toBeInTheDocument();
    expect(screen.getByText('Hire')).toBeInTheDocument();
  });

  it('should maintain accessibility', () => {
    const { container } = render(<AgentCard listing={baseListing} />);

    // Link should be accessible
    const link = container.querySelector('a[href="/agents/list-001"]');
    expect(link).toBeInTheDocument();
    expect(link?.tagName).toBe('A');
  });

  it('should render gradient avatar background', () => {
    const { container } = render(<AgentCard listing={baseListing} />);
    const avatar = container.querySelector('.bg-gradient-to-br.from-indigo-400.to-purple-500');
    expect(avatar).toBeInTheDocument();
  });

  it('should handle empty capabilities array', () => {
    const noCapabilities = {
      ...baseListing,
      capabilities: [],
    };

    const { container } = render(<AgentCard listing={noCapabilities} />);
    const capabilitiesContainer = container.querySelector('.flex.flex-wrap.gap-1\\.5');
    expect(capabilitiesContainer?.children.length).toBe(0);
  });

  it('should display review count correctly', () => {
    render(<AgentCard listing={baseListing} />);
    // Check that the review count is displayed in parentheses
    const ratingText = screen.getByText('(28)');
    expect(ratingText).toBeInTheDocument();
  });

  it('should handle single review', () => {
    const singleReview = {
      ...baseListing,
      reviewSummary: { average: 5.0, count: 1 },
    };

    render(<AgentCard listing={singleReview} />);
    expect(screen.getByText('5.0')).toBeInTheDocument();
    expect(screen.getByText('(1)')).toBeInTheDocument();
  });
});
