/**
 * Inline tag creation — end-to-end through AddTagNoteModal.
 *
 * Drives the real NoteForm + TagCombobox + bible store with a
 * mocked api layer (the integration-test convention here —
 * no browser e2e infra exists). Covers the main flows from
 * the spec: Enter-create top-level, under… parent picker,
 * `Work/design` path creation with ancestor reuse, Undo,
 * and Move under….
 */
import '@testing-library/jest-dom';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react';
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
} from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { Notifications } from '@mantine/notifications';
import AddTagNoteModal from '../../components/AddTagNoteModal';
import { useBibleStore } from '../../store';
import { useAuthStore } from '../../stores/authStore';
import { mockDomApis } from '../helpers';
import * as api from '../../api';
import type { Tag } from '../../types';

// Manual automock — same Proxy pattern as tag-refresh:
// error classes stay real, api fns become vi.fn() on demand.
vi.mock('../../api', async () => {
  const errors = await vi.importActual<
    typeof import('../../api/errors')
  >('../../api/errors');
  const constants: Record<PropertyKey, unknown> = {
    ...errors,
    UNTAGGED_TAG_ID: 'untagged',
  };
  const fns = new Map<PropertyKey, unknown>();
  return new Proxy(constants, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (
        prop === 'then' ||
        prop === 'default' ||
        prop === Symbol.toStringTag
      ) {
        return undefined;
      }
      if (!fns.has(prop)) fns.set(prop, vi.fn());
      return fns.get(prop);
    },
    has(target, prop) {
      return (
        prop in target ||
        (prop !== 'then' && prop !== 'default')
      );
    },
  });
});
const mockApi = vi.mocked(api);

// ProseMirror needs DOM APIs happy-dom lacks — stub the editor.
vi.mock('../../components/RichTextEditor', async () => ({
  default: (
    await import('../mocks/RichTextEditorStub')
  ).default,
}));

// The modal's verse/linked-note plumbing is irrelevant here.
vi.mock('../../hooks/useVerseTexts', async () => {
  const actual = await vi.importActual<
    typeof import('../../hooks/useVerseTexts')
  >('../../hooks/useVerseTexts');
  return {
    ...actual,
    useVerseTexts: () => [],
  };
});

const editorSubmit = vi.fn().mockResolvedValue(true);
vi.mock('../../hooks/useNoteEditor', () => ({
  useNoteEditor: () => ({
    submit: editorSubmit,
    save: vi.fn().mockResolvedValue(true),
    trackDraft: vi.fn(),
    trackFiles: vi.fn(),
    draft: null,
  }),
}));

const makeTag = (
  id: string,
  name: string,
  parent_tag: string | null = null
): Tag => ({
  id,
  name,
  parent_tag,
  note_count: 0,
  public: false,
  created_at: '',
  updated_at: '',
});

/** In-memory tag DB — the api mocks read/write it. */
let tagDb: Tag[];
let nextId: number;

const wireTagDb = (initial: Tag[]) => {
  tagDb = [...initial];
  nextId = 100;
  mockApi.getTags.mockImplementation(async () => [...tagDb]);
  mockApi.createTag.mockImplementation(
    async (name: string, parentTagId?: string | null) => {
      const created = makeTag(
        `TAG-${nextId++}`,
        name,
        parentTagId ?? null
      );
      tagDb.push(created);
      return created;
    }
  );
  mockApi.deleteTag.mockImplementation(async (id: string) => {
    tagDb = tagDb.filter((t) => t.id !== id);
  });
  mockApi.reparentTag.mockImplementation(
    async (id: string, parentTagId: string | null) => {
      const found = tagDb.find((t) => t.id === id);
      if (found) found.parent_tag = parentTagId;
      return found as Tag;
    }
  );
  mockApi.getLinkedNotes.mockResolvedValue({
    count: 0,
    results: [],
  });
};

const openCombobox = () => {
  const input = screen.getByLabelText('Tag');
  fireEvent.mouseDown(input);
  return input;
};

const typeQuery = (input: HTMLElement, query: string) =>
  fireEvent.change(input, { target: { value: query } });

describe('inline tag creation (AddTagNoteModal)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDomApis();
    wireTagDb([
      makeTag('TAG-1', 'Work'),
      makeTag('TAG-2', 'design', 'TAG-1'),
      makeTag('TAG-3', 'School'),
    ]);
    useBibleStore.setState({
      tags: [],
      notes: [],
      verseSelection: null,
      translations: [],
      activeTextFilesetId: null,
      activeBookId: 'JHN',
      lastSelectedTagId: null,
    });
    useAuthStore.setState({
      token: 'test-token',
      user: { username: 'testuser' },
      isAuthenticated: true,
      isLoading: false,
      error: null,
    });
    render(
      <MemoryRouter>
        <Notifications />
        <AddTagNoteModal opened onClose={vi.fn()} />
      </MemoryRouter>
    );
  });

  it('creates a top-level tag with Enter — no dialog', async () => {
    const input = openCombobox();
    typeQuery(input, 'prayer');
    const createRow = await screen.findByRole('option', {
      name: '+ Create "prayer"',
    });
    // Highlight it and confirm with Enter — the dropdown has
    // existing tags first, so arrow to the row.
    for (let i = 0; i < 20; i += 1) {
      if (
        input.getAttribute('aria-activedescendant') ===
        createRow.id
      ) {
        break;
      }
      fireEvent.keyDown(input, { key: 'ArrowDown' });
    }
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(mockApi.createTag).toHaveBeenCalledWith(
        'prayer',
        null
      );
    });
    // Attached to the note — the field shows the new tag.
    await waitFor(() => {
      expect(
        useBibleStore.getState().tags.map((t) => t.name)
      ).toContain('prayer');
    });
    // No tag dialog — creation was fully inline.
    expect(
      screen.queryByRole('dialog', { name: /tag/i })
    ).not.toBeInTheDocument();
    const status = await screen.findByRole('status');
    // The live region sits inside the modal's accessible
    // tree — portals are aria-hidden under an open modal.
    expect(
      status.closest('[aria-modal="true"]')
    ).not.toBeNull();
    // Enter on the combobox must never submit the form.
    expect(editorSubmit).not.toHaveBeenCalled();
  });

  it('creates under a parent via the picker', async () => {
    const input = openCombobox();
    typeQuery(input, 'docs');
    fireEvent.mouseDown(
      await screen.findByRole('option', {
        name: '+ Create "docs" under…',
      })
    );
    await screen.findByText('Create “docs” under:');
    fireEvent.mouseDown(
      await screen.findByRole('option', { name: 'Work' })
    );
    await waitFor(() => {
      expect(mockApi.createTag).toHaveBeenCalledWith(
        'docs',
        'TAG-1'
      );
    });
  });

  it('creates Work/design reusing the existing ancestor', async () => {
    const input = openCombobox();
    typeQuery(input, 'Work/research');
    fireEvent.mouseDown(
      await screen.findByRole('option', {
        name: '+ Create "Work/research"',
      })
    );
    await waitFor(() => {
      // Only the leaf — 'Work' was reused, not recreated.
      expect(mockApi.createTag).toHaveBeenCalledTimes(1);
      expect(mockApi.createTag).toHaveBeenCalledWith(
        'research',
        'TAG-1'
      );
    });
    // Toast announces the full path.
    const toast = await screen.findByRole('status');
    expect(toast).toHaveTextContent('Work › research');
  });

  it('Undo deletes what the action created', async () => {
    const input = openCombobox();
    typeQuery(input, 'fresh');
    fireEvent.mouseDown(
      await screen.findByRole('option', {
        name: '+ Create "fresh"',
      })
    );
    await waitFor(() => {
      expect(mockApi.createTag).toHaveBeenCalled();
    });
    const created = tagDb[tagDb.length - 1];
    fireEvent.click(
      await screen.findByRole('button', { name: 'Undo' })
    );
    await waitFor(() => {
      expect(mockApi.deleteTag).toHaveBeenCalledWith(
        created.id
      );
    });
    // The tag is gone and the field reverted to empty.
    expect(
      tagDb.find((t) => t.id === created.id)
    ).toBeUndefined();
    await waitFor(() => {
      expect(
        (screen.getByLabelText('Tag') as HTMLInputElement)
          .value
      ).toBe('');
    });
  });

  it('Move under… re-parents the new tag', async () => {
    const input = openCombobox();
    typeQuery(input, 'fresh');
    fireEvent.mouseDown(
      await screen.findByRole('option', {
        name: '+ Create "fresh"',
      })
    );
    await waitFor(() => {
      expect(mockApi.createTag).toHaveBeenCalled();
    });
    const created = tagDb[tagDb.length - 1];
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Move under…',
      })
    );
    const pane = await screen.findByRole('listbox', {
      name: 'Move "fresh" under',
    });
    fireEvent.mouseDown(
      await within(pane).findByRole('option', {
        name: 'Work',
      })
    );
    await waitFor(() => {
      expect(mockApi.reparentTag).toHaveBeenCalledWith(
        created.id,
        'TAG-1'
      );
    });
    await waitFor(() => {
      expect(
        tagDb.find((t) => t.id === created.id)?.parent_tag
      ).toBe('TAG-1');
    });
  });
});
