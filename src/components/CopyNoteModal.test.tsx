import {
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { showNotification } from '@mantine/notifications';
import CopyNoteModal from './CopyNoteModal';
import { server } from '../mocks/server';
import { API_BASE_URL } from '../config';
import {
  renderWithProviders,
  mockDomApis,
  createMockNote,
  createMockTag,
  createMockVerse,
} from '../__tests__/helpers';

// showNotification is asserted on directly — the Mantine
// notifications portal is not mounted in tests.
vi.mock('@mantine/notifications', () => ({
  showNotification: vi.fn(),
}));

const note = createMockNote({
  id: 'src-n1',
  is_owner: false,
  public: true,
  verses: [createMockVerse()],
});

const faithTag = createMockTag({ id: 'tag-faith', name: 'Faith' });

const renderModal = () =>
  renderWithProviders(
    <CopyNoteModal opened onClose={vi.fn()} note={note} />,
    {
      authStoreState: { isAuthenticated: true },
      storeOverrides: { tags: [faithTag] },
    }
  );

/** Captures the /copy/ request body for later assertions. */
const captureCopyBody = () => {
  let body: { tag_id?: string } | null = null;
  server.use(
    http.post(
      `${API_BASE_URL}/api/v1/notes/:noteId/copy/`,
      async ({ request }) => {
        body = (await request.json()) as { tag_id?: string };
        return HttpResponse.json(note, { status: 201 });
      }
    )
  );
  return () => body;
};

describe('CopyNoteModal', () => {
  beforeEach(() => {
    mockDomApis();
    vi.clearAllMocks();
  });

  it('copies into the picked target tag', async () => {
    const getBody = captureCopyBody();
    renderModal();

    // The combobox opens on mouse down; the option row
    // carries the tag's path label.
    const input = screen.getByRole('combobox');
    fireEvent.mouseDown(input);
    fireEvent.mouseDown(
      await screen.findByRole('option', { name: 'Faith' })
    );
    // Picking a tag unselects the Untagged option.
    expect(
      screen.getByRole('radio', { name: 'Untagged' })
    ).not.toBeChecked();

    fireEvent.click(
      screen.getByRole('button', { name: 'Copy' })
    );

    await waitFor(() => {
      expect(getBody()).toEqual({ tag_id: 'tag-faith' });
    });
    await waitFor(() => {
      expect(showNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Note copied to your account',
        })
      );
    });
  });

  it('defaults to Untagged and copies without a tag', async () => {
    const getBody = captureCopyBody();
    renderModal();

    expect(
      screen.getByRole('radio', { name: 'Untagged' })
    ).toBeChecked();

    fireEvent.click(
      screen.getByRole('button', { name: 'Copy' })
    );

    await waitFor(() => {
      expect(getBody()).toEqual({ tag_id: 'untagged' });
    });
  });

  it('switches back to Untagged after picking a tag',
    async () => {
      const getBody = captureCopyBody();
      renderModal();

      const input = screen.getByRole('combobox');
      fireEvent.mouseDown(input);
      fireEvent.mouseDown(
        await screen.findByRole('option', { name: 'Faith' })
      );
      fireEvent.click(
        screen.getByRole('radio', { name: 'Untagged' })
      );
      expect(
        screen.getByRole('radio', { name: 'Untagged' })
      ).toBeChecked();

      fireEvent.click(
        screen.getByRole('button', { name: 'Copy' })
      );

      await waitFor(() => {
        expect(getBody()).toEqual({ tag_id: 'untagged' });
      });
    });
});
