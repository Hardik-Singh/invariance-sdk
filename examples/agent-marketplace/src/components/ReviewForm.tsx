'use client';

/**
 * Star rating + category rating form for reviewing a completed hire.
 */
import { useState } from 'react';

interface ReviewFormProps {
  hireId: string;
  onSubmit: (review: ReviewPayload) => void;
}

export interface ReviewPayload {
  hireId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment: string;
  categories: {
    quality: 1 | 2 | 3 | 4 | 5;
    communication: 1 | 2 | 3 | 4 | 5;
    speed: 1 | 2 | 3 | 4 | 5;
    value: 1 | 2 | 3 | 4 | 5;
  };
}

type CategoryKey = keyof ReviewPayload['categories'];

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  quality: 'Quality',
  communication: 'Communication',
  speed: 'Speed',
  value: 'Value for Money',
};

function StarInput({
  value,
  onChange,
  size = 'lg',
}: {
  value: number;
  onChange: (v: 1 | 2 | 3 | 4 | 5) => void;
  size?: 'sm' | 'lg';
}) {
  const [hovered, setHovered] = useState(0);
  const sizeClass = size === 'lg' ? 'h-8 w-8' : 'h-5 w-5';

  return (
    <div className="flex gap-0.5">
      {([1, 2, 3, 4, 5] as const).map((star) => (
        <button
          key={star}
          type="button"
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(star)}
          className="focus:outline-none"
        >
          <svg
            className={`${sizeClass} transition ${
              star <= (hovered || value) ? 'text-amber-400' : 'text-gray-200'
            } hover:scale-110`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </button>
      ))}
    </div>
  );
}

export default function ReviewForm({ hireId, onSubmit }: ReviewFormProps) {
  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5>(5);
  const [comment, setComment] = useState('');
  const [categories, setCategories] = useState<ReviewPayload['categories']>({
    quality: 5,
    communication: 5,
    speed: 5,
    value: 5,
  });
  const [submitted, setSubmitted] = useState(false);

  function updateCategory(key: CategoryKey, val: 1 | 2 | 3 | 4 | 5) {
    setCategories((prev) => ({ ...prev, [key]: val }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({ hireId, rating, comment, categories });
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center">
        <svg className="mx-auto h-8 w-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        <p className="mt-2 font-medium text-emerald-800">Review submitted successfully!</p>
        <p className="text-sm text-emerald-600">Your feedback is now recorded on-chain.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-lg border border-gray-200 bg-white p-5">
      <h4 className="font-semibold text-gray-900">Leave a Review</h4>

      {/* Overall rating */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Overall Rating</label>
        <StarInput value={rating} onChange={setRating} size="lg" />
      </div>

      {/* Category ratings */}
      <div className="grid grid-cols-2 gap-4">
        {(Object.entries(CATEGORY_LABELS) as [CategoryKey, string][]).map(([key, label]) => (
          <div key={key}>
            <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
            <StarInput
              value={categories[key]}
              onChange={(v) => updateCategory(key, v)}
              size="sm"
            />
          </div>
        ))}
      </div>

      {/* Comment */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Comment</label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          placeholder="Share your experience..."
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
        />
      </div>

      <button
        type="submit"
        className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700"
      >
        Submit Review
      </button>
    </form>
  );
}
