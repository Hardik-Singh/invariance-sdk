/**
 * Test suite for VoteButton (Voting Interface) component
 *
 * Tests the three-button voting interface (For, Against, Abstain)
 * with loading states and vote confirmation.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VoteButton } from '@/components/VoteButton';

describe('VoteButton (Voting Interface)', () => {
  const mockOnVote = vi.fn();
  const intentId = 'intent-test-123';

  beforeEach(() => {
    mockOnVote.mockClear();
  });

  it('should render all three voting buttons', () => {
    render(<VoteButton intentId={intentId} onVote={mockOnVote} />);

    expect(screen.getByRole('button', { name: /for/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /against/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /abstain/i })).toBeInTheDocument();
  });

  it('should call onVote with approve=true when "For" is clicked', async () => {
    const user = userEvent.setup();
    mockOnVote.mockResolvedValue(undefined);

    render(<VoteButton intentId={intentId} onVote={mockOnVote} />);

    const forButton = screen.getByRole('button', { name: /^for$/i });
    await user.click(forButton);

    await waitFor(() => {
      expect(mockOnVote).toHaveBeenCalledWith(intentId, true);
    });
  });

  it('should call onVote with approve=false and reason when "Against" is clicked', async () => {
    const user = userEvent.setup();
    mockOnVote.mockResolvedValue(undefined);

    render(<VoteButton intentId={intentId} onVote={mockOnVote} />);

    const againstButton = screen.getByRole('button', { name: /against/i });
    await user.click(againstButton);

    await waitFor(() => {
      expect(mockOnVote).toHaveBeenCalledWith(intentId, false, 'Voted against');
    });
  });

  it('should call onVote with approve=false and "Abstained" reason when "Abstain" is clicked', async () => {
    const user = userEvent.setup();
    mockOnVote.mockResolvedValue(undefined);

    render(<VoteButton intentId={intentId} onVote={mockOnVote} />);

    const abstainButton = screen.getByRole('button', { name: /abstain/i });
    await user.click(abstainButton);

    await waitFor(() => {
      expect(mockOnVote).toHaveBeenCalledWith(intentId, false, 'Abstained');
    });
  });

  it('should show loading state when voting', async () => {
    const user = userEvent.setup();
    let resolveVote: () => void;
    const votePromise = new Promise<void>((resolve) => {
      resolveVote = resolve;
    });
    mockOnVote.mockReturnValue(votePromise);

    render(<VoteButton intentId={intentId} onVote={mockOnVote} />);

    const forButton = screen.getByRole('button', { name: /^for$/i });
    await user.click(forButton);

    // Should show loading text
    expect(screen.getByText(/voting.../i)).toBeInTheDocument();

    // Other buttons should be disabled
    const againstButton = screen.getByRole('button', { name: /against/i });
    expect(againstButton).toBeDisabled();

    resolveVote!();
  });

  it('should display confirmation after successful vote (For)', async () => {
    const user = userEvent.setup();
    mockOnVote.mockResolvedValue(undefined);

    render(<VoteButton intentId={intentId} onVote={mockOnVote} />);

    const forButton = screen.getByRole('button', { name: /^for$/i });
    await user.click(forButton);

    await waitFor(() => {
      expect(screen.getByText('Voted For')).toBeInTheDocument();
    });

    // Buttons should be replaced with confirmation text
    expect(screen.queryByRole('button', { name: /^for$/i })).not.toBeInTheDocument();
  });

  it('should display confirmation after successful vote (Against)', async () => {
    const user = userEvent.setup();
    mockOnVote.mockResolvedValue(undefined);

    render(<VoteButton intentId={intentId} onVote={mockOnVote} />);

    const againstButton = screen.getByRole('button', { name: /against/i });
    await user.click(againstButton);

    await waitFor(() => {
      expect(screen.getByText('Voted Against')).toBeInTheDocument();
    });
  });

  it('should display confirmation after successful vote (Abstain)', async () => {
    const user = userEvent.setup();
    mockOnVote.mockResolvedValue(undefined);

    render(<VoteButton intentId={intentId} onVote={mockOnVote} />);

    const abstainButton = screen.getByRole('button', { name: /abstain/i });
    await user.click(abstainButton);

    await waitFor(() => {
      expect(screen.getByText('Abstained')).toBeInTheDocument();
    });
  });

  it('should prevent multiple votes', async () => {
    const user = userEvent.setup();
    mockOnVote.mockResolvedValue(undefined);

    render(<VoteButton intentId={intentId} onVote={mockOnVote} />);

    const forButton = screen.getByRole('button', { name: /^for$/i });
    await user.click(forButton);

    await waitFor(() => {
      expect(screen.getByText('Voted For')).toBeInTheDocument();
    });

    // Try to vote again - buttons should not be present
    expect(screen.queryByRole('button', { name: /^for$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /against/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /abstain/i })).not.toBeInTheDocument();

    // onVote should have been called only once
    expect(mockOnVote).toHaveBeenCalledTimes(1);
  });

  it('should disable all buttons when disabled prop is true', () => {
    render(<VoteButton intentId={intentId} onVote={mockOnVote} disabled={true} />);

    expect(screen.getByRole('button', { name: /^for$/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /against/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /abstain/i })).toBeDisabled();
  });

  it('should not call onVote when button is disabled', async () => {
    const user = userEvent.setup();
    mockOnVote.mockResolvedValue(undefined);

    render(<VoteButton intentId={intentId} onVote={mockOnVote} disabled={true} />);

    const forButton = screen.getByRole('button', { name: /^for$/i });
    await user.click(forButton);

    // onVote should not be called because button is disabled
    expect(mockOnVote).not.toHaveBeenCalled();
  });

  it('should handle vote errors gracefully', async () => {
    const user = userEvent.setup();
    mockOnVote.mockRejectedValue(new Error('Vote failed'));

    render(<VoteButton intentId={intentId} onVote={mockOnVote} />);

    const forButton = screen.getByRole('button', { name: /^for$/i });
    await user.click(forButton);

    // Should still show buttons after error (not confirmed state)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^for$/i })).toBeInTheDocument();
    });
  });

  it('should apply correct styling to each button', () => {
    const { container } = render(<VoteButton intentId={intentId} onVote={mockOnVote} />);

    const forButton = screen.getByRole('button', { name: /^for$/i });
    expect(forButton).toHaveClass('bg-emerald-600/20', 'text-emerald-400');

    const againstButton = screen.getByRole('button', { name: /against/i });
    expect(againstButton).toHaveClass('bg-red-600/20', 'text-red-400');

    const abstainButton = screen.getByRole('button', { name: /abstain/i });
    expect(abstainButton).toHaveClass('bg-slate-600/20', 'text-slate-400');
  });

  it('should apply correct color to confirmation text', async () => {
    const user = userEvent.setup();
    mockOnVote.mockResolvedValue(undefined);

    const { rerender } = render(<VoteButton intentId={intentId} onVote={mockOnVote} />);

    // Test "For" confirmation color
    const forButton = screen.getByRole('button', { name: /^for$/i });
    await user.click(forButton);

    await waitFor(() => {
      const confirmation = screen.getByText('Voted For');
      expect(confirmation).toHaveClass('text-emerald-400');
    });

    // Reset and test "Against" confirmation color
    mockOnVote.mockClear();
    rerender(<VoteButton intentId={`${intentId}-2`} onVote={mockOnVote} />);

    const againstButton = screen.getByRole('button', { name: /against/i });
    await user.click(againstButton);

    await waitFor(() => {
      const confirmation = screen.getByText('Voted Against');
      expect(confirmation).toHaveClass('text-red-400');
    });

    // Reset and test "Abstain" confirmation color
    mockOnVote.mockClear();
    rerender(<VoteButton intentId={`${intentId}-3`} onVote={mockOnVote} />);

    const abstainButton = screen.getByRole('button', { name: /abstain/i });
    await user.click(abstainButton);

    await waitFor(() => {
      const confirmation = screen.getByText('Abstained');
      expect(confirmation).toHaveClass('text-slate-400');
    });
  });

  it('should disable buttons during loading even without disabled prop', async () => {
    const user = userEvent.setup();
    let resolveVote: () => void;
    const votePromise = new Promise<void>((resolve) => {
      resolveVote = resolve;
    });
    mockOnVote.mockReturnValue(votePromise);

    render(<VoteButton intentId={intentId} onVote={mockOnVote} disabled={false} />);

    const forButton = screen.getByRole('button', { name: /^for$/i });
    await user.click(forButton);

    // All buttons should be disabled during loading
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /against/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /abstain/i })).toBeDisabled();
    });

    resolveVote!();
  });

  it('should render spinner during loading state', async () => {
    const user = userEvent.setup();
    let resolveVote: () => void;
    const votePromise = new Promise<void>((resolve) => {
      resolveVote = resolve;
    });
    mockOnVote.mockReturnValue(votePromise);

    const { container } = render(<VoteButton intentId={intentId} onVote={mockOnVote} />);

    const forButton = screen.getByRole('button', { name: /^for$/i });
    await user.click(forButton);

    // Check for spinner SVG
    await waitFor(() => {
      const spinner = container.querySelector('svg.animate-spin');
      expect(spinner).toBeInTheDocument();
    });

    resolveVote!();
  });

  it('should prevent clicking while already voting', async () => {
    const user = userEvent.setup();
    let resolveVote: () => void;
    const votePromise = new Promise<void>((resolve) => {
      resolveVote = resolve;
    });
    mockOnVote.mockReturnValue(votePromise);

    render(<VoteButton intentId={intentId} onVote={mockOnVote} />);

    const forButton = screen.getByRole('button', { name: /^for$/i });
    await user.click(forButton);

    // Try to click again while loading
    await user.click(forButton);

    // onVote should only be called once
    expect(mockOnVote).toHaveBeenCalledTimes(1);

    resolveVote!();
  });
});
