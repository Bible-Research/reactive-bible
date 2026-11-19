import {
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ShareModal from './ShareModal';
import {
  renderWithProviders,
  mockDomApis,
} from '../__tests__/helpers';
import * as api from '../api';

// The dialog's API surface is thin — spy on the barrel so
// each case sees the exact calls.
vi.mock('../api', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    shareNote: vi.fn().mockResolvedValue({ shared: true }),
    unshareNote: vi.fn().mockResolvedValue(undefined),
    getNoteShares: vi.fn().mockResolvedValue([
      {
        shared_with: 'friend',
        created_at: '2026-01-01T00:00:00Z',
      },
    ]),
    shareTag: vi.fn().mockResolvedValue({ shared: true }),
    unshareTag: vi.fn().mockResolvedValue(undefined),
    getTagShares: vi.fn().mockResolvedValue([
      {
        shared_with: 'friend',
        include_descendants: true,
        created_at: '2026-01-01T00:00:00Z',
      },
    ]),
  };
});

describe('ShareModal', () => {
  beforeEach(() => {
    mockDomApis();
    vi.clearAllMocks();
  });

  const renderModal = (props: Partial<
    React.ComponentProps<typeof ShareModal>
  > = {}) =>
    renderWithProviders(
      <ShareModal
        opened
        onClose={vi.fn()}
        kind="note"
        resourceId="n1"
        {...props}
      />,
      { authStoreState: { isAuthenticated: true } }
    );

  it('lists existing grants and posts a new share', async () => {
    renderModal();

    // The owner-only grant listing resolves first.
    await waitFor(() => {
      expect(screen.getByText('friend')).toBeInTheDocument();
    });

    fireEvent.change(
      screen.getByLabelText('Username'),
      { target: { value: 'someone' } }
    );
    fireEvent.click(screen.getByText('Share'));

    await waitFor(() => {
      expect(api.shareNote).toHaveBeenCalledWith(
        'n1',
        'someone'
      );
    });
  });

  it('revokes a grant via the remove button', async () => {
    renderModal();

    await waitFor(() => {
      expect(screen.getByText('friend')).toBeInTheDocument();
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Revoke' })
    );

    await waitFor(() => {
      expect(api.unshareNote).toHaveBeenCalledWith(
        'n1',
        'friend'
      );
    });
    await waitFor(() => {
      expect(
        screen.queryByText('friend')
      ).not.toBeInTheDocument();
    });
  });

  it('sends include_descendants for tag shares', async () => {
    renderModal({ kind: 'tag', resourceId: 't1' });

    await waitFor(() => {
      expect(screen.getByText('friend')).toBeInTheDocument();
    });
    fireEvent.change(
      screen.getByLabelText('Username'),
      { target: { value: 'someone' } }
    );
    // The checkbox defaults to including sub-tag notes.
    fireEvent.click(
      screen.getByRole('button', { name: 'Share' })
    );

    await waitFor(() => {
      expect(api.shareTag).toHaveBeenCalledWith(
        't1',
        'someone',
        true
      );
    });
  });
});
