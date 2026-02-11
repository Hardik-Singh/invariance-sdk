/**
 * Test suite for useProposals hook
 *
 * Tests proposal management including creating proposals, voting,
 * fetching proposal data, and handling errors.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useProposals } from '@/hooks/useProposals';
import { Invariance } from '@invariance/sdk';

describe('useProposals', () => {
  it('should initialize with mock proposals', () => {
    const { result } = renderHook(() => useProposals());

    expect(result.current.proposals.length).toBeGreaterThan(0);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should provide getProposal function', () => {
    const { result } = renderHook(() => useProposals());

    const proposal = result.current.getProposal('intent-001');
    expect(proposal).toBeDefined();
    expect(proposal?.id).toBe('intent-001');
  });

  it('should return undefined for non-existent proposal', () => {
    const { result } = renderHook(() => useProposals());

    const proposal = result.current.getProposal('non-existent-id');
    expect(proposal).toBeUndefined();
  });

  it('should create a new proposal', async () => {
    const mockInv = {
      intent: {
        request: vi.fn().mockResolvedValue({
          intentId: 'intent-new-123',
          status: 'pending',
        }),
      },
      ledger: {
        log: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as Invariance;

    const { result } = renderHook(() => useProposals());

    const input = {
      title: 'New Test Proposal',
      description: 'This is a test proposal',
      action: 'test-action',
      params: { foo: 'bar' },
    };

    await act(async () => {
      await result.current.createProposal(
        mockInv,
        input,
        '0x1234567890123456789012345678901234567890'
      );
    });

    await waitFor(() => {
      const newProposal = result.current.proposals[0];
      expect(newProposal.title).toBe('New Test Proposal');
      expect(newProposal.status).toBe('pending');
      expect(newProposal.votesFor).toBe(0);
      expect(newProposal.votesAgainst).toBe(0);
    });
  });

  it('should set loading state during proposal creation', async () => {
    let resolveRequest: (value: any) => void;
    const requestPromise = new Promise((resolve) => {
      resolveRequest = resolve;
    });

    const mockInv = {
      intent: {
        request: vi.fn().mockReturnValue(requestPromise),
      },
      ledger: {
        log: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as Invariance;

    const { result } = renderHook(() => useProposals());

    const input = {
      title: 'Test Proposal',
      description: 'Description',
      action: 'action',
      params: {},
    };

    act(() => {
      result.current.createProposal(mockInv, input, '0xProposer');
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(true);
    });

    resolveRequest!({ intentId: 'intent-123', status: 'pending' });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('should handle proposal creation errors with fallback', async () => {
    const mockInv = {
      intent: {
        request: vi.fn().mockRejectedValue(new Error('Failed to create proposal')),
      },
      ledger: {
        log: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as Invariance;

    const { result } = renderHook(() => useProposals());

    const input = {
      title: 'Test Proposal',
      description: 'Description',
      action: 'action',
      params: {},
    };

    await act(async () => {
      await result.current.createProposal(mockInv, input, '0xProposer');
    });

    await waitFor(() => {
      expect(result.current.error).toBe('Failed to create proposal');
    });

    // Should still create a local fallback proposal
    const localProposal = result.current.proposals.find((p) =>
      p.id.includes('intent-local-')
    );
    expect(localProposal).toBeDefined();
    expect(localProposal?.title).toBe('Test Proposal');
  });

  it('should log proposal creation to event ledger', async () => {
    const mockInv = {
      intent: {
        request: vi.fn().mockResolvedValue({
          intentId: 'intent-123',
          status: 'pending',
        }),
      },
      ledger: {
        log: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as Invariance;

    const { result } = renderHook(() => useProposals());

    const input = {
      title: 'Test Proposal',
      description: 'Description',
      action: 'action',
      params: {},
    };

    await act(async () => {
      await result.current.createProposal(mockInv, input, '0xProposer');
    });

    await waitFor(() => {
      expect(mockInv.ledger.log).toHaveBeenCalledWith({
        action: 'proposal-created',
        actor: { type: 'human', address: '0xProposer' },
        category: 'custom',
        metadata: expect.objectContaining({
          proposalId: 'intent-123',
          title: 'Test Proposal',
        }),
      });
    });
  });

  it('should handle ledger logging errors gracefully', async () => {
    const mockInv = {
      intent: {
        request: vi.fn().mockResolvedValue({
          intentId: 'intent-123',
          status: 'pending',
        }),
      },
      ledger: {
        log: vi.fn().mockRejectedValue(new Error('Ledger logging failed')),
      },
    } as unknown as Invariance;

    const { result } = renderHook(() => useProposals());

    const input = {
      title: 'Test Proposal',
      description: 'Description',
      action: 'action',
      params: {},
    };

    // Should not throw even if ledger logging fails
    await act(async () => {
      await result.current.createProposal(mockInv, input, '0xProposer');
    });

    await waitFor(() => {
      const newProposal = result.current.proposals[0];
      expect(newProposal.title).toBe('Test Proposal');
    });
  });

  it('should vote for a proposal (approve)', async () => {
    const mockInv = {
      intent: {
        approve: vi.fn().mockResolvedValue(undefined),
        status: vi.fn().mockResolvedValue({
          lifecycle: 'pending',
          approvals: {
            signers: [
              { address: '0xVoter', approved: true, timestamp: Date.now() },
            ],
          },
        }),
      },
    } as unknown as Invariance;

    const { result } = renderHook(() => useProposals());

    const proposalId = result.current.proposals[0].id;
    const initialVotesFor = result.current.proposals[0].votesFor;

    await act(async () => {
      await result.current.vote(mockInv, proposalId, true);
    });

    await waitFor(() => {
      expect(mockInv.intent.approve).toHaveBeenCalledWith(proposalId);
    });
  });

  it('should vote against a proposal (reject)', async () => {
    const mockInv = {
      intent: {
        reject: vi.fn().mockResolvedValue(undefined),
        status: vi.fn().mockResolvedValue({
          lifecycle: 'pending',
          approvals: {
            signers: [
              { address: '0xVoter', approved: false, timestamp: Date.now() },
            ],
          },
        }),
      },
    } as unknown as Invariance;

    const { result } = renderHook(() => useProposals());

    const proposalId = result.current.proposals[0].id;

    await act(async () => {
      await result.current.vote(mockInv, proposalId, false, 'Not convinced');
    });

    await waitFor(() => {
      expect(mockInv.intent.reject).toHaveBeenCalledWith(proposalId, 'Not convinced');
    });
  });

  it('should update proposal status after voting', async () => {
    const mockInv = {
      intent: {
        approve: vi.fn().mockResolvedValue(undefined),
        status: vi.fn().mockResolvedValue({
          lifecycle: 'approved',
          approvals: {
            signers: [
              { address: '0xVoter1', approved: true, timestamp: Date.now() },
              { address: '0xVoter2', approved: true, timestamp: Date.now() },
              { address: '0xVoter3', approved: true, timestamp: Date.now() },
            ],
          },
        }),
      },
    } as unknown as Invariance;

    const { result } = renderHook(() => useProposals());

    const proposalId = result.current.proposals[0].id;

    await act(async () => {
      await result.current.vote(mockInv, proposalId, true);
    });

    await waitFor(() => {
      const updatedProposal = result.current.proposals.find((p) => p.id === proposalId);
      expect(updatedProposal?.status).toBe('approved');
      expect(updatedProposal?.votesFor).toBe(3);
    });
  });

  it('should handle voting errors with optimistic update', async () => {
    const mockInv = {
      intent: {
        approve: vi.fn().mockRejectedValue(new Error('Vote failed')),
      },
    } as unknown as Invariance;

    const { result } = renderHook(() => useProposals());

    const proposalId = result.current.proposals[0].id;
    const initialVotesFor = result.current.proposals[0].votesFor;

    await act(async () => {
      await result.current.vote(mockInv, proposalId, true);
    });

    await waitFor(() => {
      expect(result.current.error).toBe('Failed to submit vote');
    });

    // Should optimistically update the vote count
    const updatedProposal = result.current.proposals.find((p) => p.id === proposalId);
    expect(updatedProposal?.votesFor).toBe(initialVotesFor + 1);
  });

  it('should set loading state during voting', async () => {
    let resolveVote: (value: any) => void;
    const votePromise = new Promise((resolve) => {
      resolveVote = resolve;
    });

    const mockInv = {
      intent: {
        approve: vi.fn().mockReturnValue(votePromise),
        status: vi.fn().mockResolvedValue({
          lifecycle: 'pending',
          approvals: { signers: [] },
        }),
      },
    } as unknown as Invariance;

    const { result } = renderHook(() => useProposals());

    const proposalId = result.current.proposals[0].id;

    act(() => {
      result.current.vote(mockInv, proposalId, true);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(true);
    });

    resolveVote!(undefined);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('should update voters list after voting', async () => {
    const mockInv = {
      intent: {
        approve: vi.fn().mockResolvedValue(undefined),
        status: vi.fn().mockResolvedValue({
          lifecycle: 'pending',
          approvals: {
            signers: [
              { address: '0xVoter1', approved: true, timestamp: 1000000 },
              { address: '0xVoter2', approved: true, timestamp: 1000001 },
            ],
          },
        }),
      },
    } as unknown as Invariance;

    const { result } = renderHook(() => useProposals());

    const proposalId = result.current.proposals[0].id;

    await act(async () => {
      await result.current.vote(mockInv, proposalId, true);
    });

    await waitFor(() => {
      const updatedProposal = result.current.proposals.find((p) => p.id === proposalId);
      expect(updatedProposal?.voters.length).toBe(2);
      expect(updatedProposal?.voters[0].address).toBe('0xVoter1');
    });
  });

  it('should handle proposals with no approvals data', async () => {
    const mockInv = {
      intent: {
        approve: vi.fn().mockResolvedValue(undefined),
        status: vi.fn().mockResolvedValue({
          lifecycle: 'pending',
          approvals: undefined,
        }),
      },
    } as unknown as Invariance;

    const { result } = renderHook(() => useProposals());

    const proposalId = result.current.proposals[0].id;
    const initialVotesFor = result.current.proposals[0].votesFor;

    await act(async () => {
      await result.current.vote(mockInv, proposalId, true);
    });

    // Should maintain existing vote counts when approvals data is missing
    await waitFor(() => {
      const updatedProposal = result.current.proposals.find((p) => p.id === proposalId);
      expect(updatedProposal?.votesFor).toBe(initialVotesFor);
    });
  });

  it('should include params in intent request', async () => {
    const mockInv = {
      intent: {
        request: vi.fn().mockResolvedValue({
          intentId: 'intent-123',
          status: 'pending',
        }),
      },
      ledger: {
        log: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as Invariance;

    const { result } = renderHook(() => useProposals());

    const input = {
      title: 'Test Proposal',
      description: 'Test Description',
      action: 'transfer-funds',
      params: { recipient: '0xRecipient', amount: '1000' },
    };

    await act(async () => {
      await result.current.createProposal(mockInv, input, '0xProposer');
    });

    await waitFor(() => {
      expect(mockInv.intent.request).toHaveBeenCalledWith({
        actor: { type: 'human', address: '0xProposer' },
        action: 'transfer-funds',
        params: {
          recipient: '0xRecipient',
          amount: '1000',
          title: 'Test Proposal',
          description: 'Test Description',
        },
        approval: 'multi-sig',
      });
    });
  });

  it('should prepend new proposals to the list', async () => {
    const mockInv = {
      intent: {
        request: vi.fn().mockResolvedValue({
          intentId: 'intent-newest',
          status: 'pending',
        }),
      },
      ledger: {
        log: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as Invariance;

    const { result } = renderHook(() => useProposals());

    const initialFirstProposal = result.current.proposals[0];

    const input = {
      title: 'Newest Proposal',
      description: 'Description',
      action: 'action',
      params: {},
    };

    await act(async () => {
      await result.current.createProposal(mockInv, input, '0xProposer');
    });

    await waitFor(() => {
      const newFirstProposal = result.current.proposals[0];
      expect(newFirstProposal.title).toBe('Newest Proposal');
      expect(result.current.proposals[1]).toEqual(initialFirstProposal);
    });
  });
});
