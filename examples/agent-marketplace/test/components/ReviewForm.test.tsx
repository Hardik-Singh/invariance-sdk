/**
 * Test suite for ReviewForm component
 *
 * Tests star rating input, category ratings, comment submission,
 * and success state rendering.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReviewForm from '@/components/ReviewForm';
import type { ReviewPayload } from '@/components/ReviewForm';

describe('ReviewForm', () => {
  const mockOnSubmit = vi.fn();
  const hireId = 'hire-123';

  beforeEach(() => {
    mockOnSubmit.mockClear();
  });

  it('should render the form with all elements', () => {
    render(<ReviewForm hireId={hireId} onSubmit={mockOnSubmit} />);

    expect(screen.getByText('Leave a Review')).toBeInTheDocument();
    expect(screen.getByText('Overall Rating')).toBeInTheDocument();
    expect(screen.getByText('Quality')).toBeInTheDocument();
    expect(screen.getByText('Communication')).toBeInTheDocument();
    expect(screen.getByText('Speed')).toBeInTheDocument();
    expect(screen.getByText('Value for Money')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Share your experience...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit review/i })).toBeInTheDocument();
  });

  it('should initialize with default 5-star ratings', () => {
    const { container } = render(<ReviewForm hireId={hireId} onSubmit={mockOnSubmit} />);

    // All stars should be filled (amber color)
    const filledStars = container.querySelectorAll('svg.text-amber-400');
    expect(filledStars.length).toBeGreaterThan(0);
  });

  it('should allow clicking stars to change overall rating', async () => {
    const user = userEvent.setup();
    const { container } = render(<ReviewForm hireId={hireId} onSubmit={mockOnSubmit} />);

    // Find overall rating stars (first set of large stars)
    const overallStarButtons = container.querySelectorAll('button svg.h-8.w-8');
    expect(overallStarButtons.length).toBe(5);

    // Click the 3rd star
    const thirdStarButton = overallStarButtons[2].closest('button');
    await user.click(thirdStarButton!);

    // Submit the form to check the rating value
    const submitButton = screen.getByRole('button', { name: /submit review/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          rating: 3,
        })
      );
    });
  });

  it('should allow changing category ratings', async () => {
    const user = userEvent.setup();
    const { container } = render(<ReviewForm hireId={hireId} onSubmit={mockOnSubmit} />);

    // Find small stars (category ratings)
    const smallStarButtons = container.querySelectorAll('button svg.h-5.w-5');

    // Click a category star (e.g., first category, 2nd star)
    const categoryStarButton = smallStarButtons[1].closest('button');
    await user.click(categoryStarButton!);

    const submitButton = screen.getByRole('button', { name: /submit review/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalled();
    });
  });

  it('should allow entering a comment', async () => {
    const user = userEvent.setup();
    render(<ReviewForm hireId={hireId} onSubmit={mockOnSubmit} />);

    const commentTextarea = screen.getByPlaceholderText('Share your experience...');
    await user.type(commentTextarea, 'Great agent, very responsive!');

    const submitButton = screen.getByRole('button', { name: /submit review/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          comment: 'Great agent, very responsive!',
        })
      );
    });
  });

  it('should submit complete review payload', async () => {
    const user = userEvent.setup();
    render(<ReviewForm hireId={hireId} onSubmit={mockOnSubmit} />);

    // Enter comment
    const commentTextarea = screen.getByPlaceholderText('Share your experience...');
    await user.type(commentTextarea, 'Excellent work!');

    // Submit
    const submitButton = screen.getByRole('button', { name: /submit review/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith({
        hireId: 'hire-123',
        rating: 5,
        comment: 'Excellent work!',
        categories: {
          quality: 5,
          communication: 5,
          speed: 5,
          value: 5,
        },
      });
    });
  });

  it('should show success message after submission', async () => {
    const user = userEvent.setup();
    render(<ReviewForm hireId={hireId} onSubmit={mockOnSubmit} />);

    const submitButton = screen.getByRole('button', { name: /submit review/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Review submitted successfully!')).toBeInTheDocument();
    });

    expect(screen.getByText('Your feedback is now recorded on-chain.')).toBeInTheDocument();
  });

  it('should hide form after successful submission', async () => {
    const user = userEvent.setup();
    render(<ReviewForm hireId={hireId} onSubmit={mockOnSubmit} />);

    const submitButton = screen.getByRole('button', { name: /submit review/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.queryByText('Leave a Review')).not.toBeInTheDocument();
    });

    expect(screen.queryByPlaceholderText('Share your experience...')).not.toBeInTheDocument();
  });

  it('should display checkmark icon in success state', async () => {
    const user = userEvent.setup();
    const { container } = render(<ReviewForm hireId={hireId} onSubmit={mockOnSubmit} />);

    const submitButton = screen.getByRole('button', { name: /submit review/i });
    await user.click(submitButton);

    await waitFor(() => {
      const checkmark = container.querySelector('svg[viewBox="0 0 24 24"] path[d*="M5 13l4 4L19 7"]');
      expect(checkmark).toBeInTheDocument();
    });
  });

  it('should allow changing ratings multiple times before submission', async () => {
    const user = userEvent.setup();
    const { container } = render(<ReviewForm hireId={hireId} onSubmit={mockOnSubmit} />);

    // Click different stars multiple times
    const overallStarButtons = container.querySelectorAll('button svg.h-8.w-8');

    await user.click(overallStarButtons[2].closest('button')!); // 3 stars
    await user.click(overallStarButtons[4].closest('button')!); // 5 stars
    await user.click(overallStarButtons[3].closest('button')!); // 4 stars

    const submitButton = screen.getByRole('button', { name: /submit review/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          rating: 4,
        })
      );
    });
  });

  it('should show hover effect on stars', async () => {
    const user = userEvent.setup();
    const { container } = render(<ReviewForm hireId={hireId} onSubmit={mockOnSubmit} />);

    const firstStarButton = container.querySelector('button svg.h-8.w-8')?.closest('button');
    expect(firstStarButton).toBeInTheDocument();

    // The component has hover state logic, but testing actual hover is complex
    // We can verify the button exists and has the hover class
    expect(firstStarButton?.querySelector('svg')).toHaveClass('hover:scale-110');
  });

  it('should handle empty comment submission', async () => {
    const user = userEvent.setup();
    render(<ReviewForm hireId={hireId} onSubmit={mockOnSubmit} />);

    const submitButton = screen.getByRole('button', { name: /submit review/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          comment: '',
        })
      );
    });
  });

  it('should include all category ratings in payload', async () => {
    const user = userEvent.setup();
    render(<ReviewForm hireId={hireId} onSubmit={mockOnSubmit} />);

    const submitButton = screen.getByRole('button', { name: /submit review/i });
    await user.click(submitButton);

    await waitFor(() => {
      const payload = mockOnSubmit.mock.calls[0][0] as ReviewPayload;
      expect(payload.categories.quality).toBeDefined();
      expect(payload.categories.communication).toBeDefined();
      expect(payload.categories.speed).toBeDefined();
      expect(payload.categories.value).toBeDefined();
    });
  });

  it('should render all category labels', () => {
    render(<ReviewForm hireId={hireId} onSubmit={mockOnSubmit} />);

    expect(screen.getByText('Quality')).toBeInTheDocument();
    expect(screen.getByText('Communication')).toBeInTheDocument();
    expect(screen.getByText('Speed')).toBeInTheDocument();
    expect(screen.getByText('Value for Money')).toBeInTheDocument();
  });

  it('should have proper form layout with grid', () => {
    const { container } = render(<ReviewForm hireId={hireId} onSubmit={mockOnSubmit} />);

    const gridContainer = container.querySelector('.grid.grid-cols-2');
    expect(gridContainer).toBeInTheDocument();
  });

  it('should allow rating with 1 star', async () => {
    const user = userEvent.setup();
    const { container } = render(<ReviewForm hireId={hireId} onSubmit={mockOnSubmit} />);

    const overallStarButtons = container.querySelectorAll('button svg.h-8.w-8');
    await user.click(overallStarButtons[0].closest('button')!);

    const submitButton = screen.getByRole('button', { name: /submit review/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          rating: 1,
        })
      );
    });
  });

  it('should maintain form styling', () => {
    const { container } = render(<ReviewForm hireId={hireId} onSubmit={mockOnSubmit} />);

    const form = container.querySelector('form');
    expect(form).toHaveClass('space-y-5', 'rounded-lg', 'border', 'border-gray-200', 'bg-white', 'p-5');
  });

  it('should style submit button correctly', () => {
    render(<ReviewForm hireId={hireId} onSubmit={mockOnSubmit} />);

    const submitButton = screen.getByRole('button', { name: /submit review/i });
    expect(submitButton).toHaveClass('w-full', 'rounded-lg', 'bg-indigo-600', 'hover:bg-indigo-700');
  });

  it('should style success message correctly', async () => {
    const user = userEvent.setup();
    const { container } = render(<ReviewForm hireId={hireId} onSubmit={mockOnSubmit} />);

    const submitButton = screen.getByRole('button', { name: /submit review/i });
    await user.click(submitButton);

    await waitFor(() => {
      const successContainer = container.querySelector('.border-emerald-200.bg-emerald-50');
      expect(successContainer).toBeInTheDocument();
    });
  });

  it('should have textarea with proper styling', () => {
    render(<ReviewForm hireId={hireId} onSubmit={mockOnSubmit} />);

    const textarea = screen.getByPlaceholderText('Share your experience...');
    expect(textarea).toHaveClass('rounded-lg', 'border', 'border-gray-300');
    expect(textarea).toHaveAttribute('rows', '3');
  });

  it('should set correct hireId in payload', async () => {
    const user = userEvent.setup();
    const customHireId = 'hire-custom-456';
    render(<ReviewForm hireId={customHireId} onSubmit={mockOnSubmit} />);

    const submitButton = screen.getByRole('button', { name: /submit review/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          hireId: customHireId,
        })
      );
    });
  });

  it('should prevent form resubmission after success', async () => {
    const user = userEvent.setup();
    render(<ReviewForm hireId={hireId} onSubmit={mockOnSubmit} />);

    const submitButton = screen.getByRole('button', { name: /submit review/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Review submitted successfully!')).toBeInTheDocument();
    });

    // Form should be gone, can't resubmit
    expect(screen.queryByRole('button', { name: /submit review/i })).not.toBeInTheDocument();
    expect(mockOnSubmit).toHaveBeenCalledTimes(1);
  });
});
