import { describe, it, expect, vi } from 'vitest';
import {
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import TagNotesToolbar from './TagNotesToolbar';
import type { Tag } from '../types';
import { mockDomApis } from '../__tests__/helpers';

// Toolbar-facing cases ported from the skipped
// routes/__tests__/TagNotesRoute.test.tsx suite — they now run
// against the extracted component directly instead of the
// whole route.
const tags: Tag[] = [
  {
    id: 'tag-456', name: 'Prayer', parent_tag: null,
    created_at: '', updated_at: '',
  },
  {
    id: 'tag-123', name: 'Bible Study', parent_tag: null,
    created_at: '', updated_at: '',
  },
];

const renderToolbar = (
  overrides: Partial<
    Parameters<typeof TagNotesToolbar>[0]
  > = {}
) => {
  const props = {
    tags,
    isAuthenticated: true,
    tagId: 'tag-123' as string | undefined,
    tagName: 'Bible Study',
    sortOrder: 'custom_asc' as const,
    pageSize: 25,
    shownCount: 0,
    totalCount: 0,
    versesFolded: false,
    onTagChange: vi.fn(),
    onSortChange: vi.fn(),
    onPageSizeChange: vi.fn(),
    onToggleFolded: vi.fn(),
    onRefresh: vi.fn(),
    ...overrides,
  };
  mockDomApis();
  render(<TagNotesToolbar {...props} />);
  return props;
};

describe('TagNotesToolbar', () => {
  it('renders the tag selector for authenticated users ' +
    'with tags', () => {
      renderToolbar();

      const select = screen.getByLabelText('Filter by tag');
      expect(select).toBeInTheDocument();
      // Mantine Select displays the option label, not the id.
      expect(select).toHaveValue('Bible Study');
    });

  it('lists the tags sorted by name plus the untagged entry',
    async () => {
      renderToolbar();

      fireEvent.mouseDown(screen.getByLabelText('Filter by tag'));

      expect(
        await screen.findByRole('option', { name: 'Bible Study' })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('option', { name: 'Prayer' })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('option', { name: 'Untagged' })
      ).toBeInTheDocument();
      // 'Bible Study' sorts ahead of 'Prayer' in the dropdown.
      const bibleStudy = screen.getByRole('option', {
        name: 'Bible Study',
      });
      const prayer = screen.getByRole('option', {
        name: 'Prayer',
      });
      expect(
        bibleStudy.compareDocumentPosition(prayer) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    });

  it('calls onTagChange when another tag is picked', async () => {
    const { onTagChange } = renderToolbar();

    fireEvent.mouseDown(screen.getByLabelText('Filter by tag'));
    // Mantine v6 Select items select on mouseDown, not click.
    fireEvent.mouseDown(
      await screen.findByRole('option', { name: 'Prayer' })
    );

    expect(onTagChange).toHaveBeenCalledWith('tag-456');
  });

  it('renders the tag name instead of the selector when ' +
    'not authenticated', () => {
      renderToolbar({ isAuthenticated: false });

      expect(
        screen.queryByLabelText('Filter by tag')
      ).not.toBeInTheDocument();
      expect(screen.getByText('Bible Study')).toBeInTheDocument();
    });

  it('renders the tag name when the user has no tags', () => {
    renderToolbar({ tags: [] });

    expect(
      screen.queryByLabelText('Filter by tag')
    ).not.toBeInTheDocument();
    expect(screen.getByText('Bible Study')).toBeInTheDocument();
  });

  it('displays the loaded note count', () => {
    renderToolbar({ shownCount: 0, totalCount: 0 });
    expect(screen.getByText('0 notes')).toBeInTheDocument();
  });

  it('uses the singular for a single note', () => {
    renderToolbar({ shownCount: 1, totalCount: 1 });
    expect(screen.getByText('1 note')).toBeInTheDocument();
  });

  it('shows the server total when more notes exist', () => {
    renderToolbar({ shownCount: 3, totalCount: 10 });
    expect(screen.getByText('3 of 10 notes')).toBeInTheDocument();
  });

  it('shows the current sort order in the select', () => {
    renderToolbar({ sortOrder: 'created_desc' });
    expect(screen.getByDisplayValue('Date: Newest first'))
      .toBeInTheDocument();
  });

  it('shows the current page size in the select', () => {
    renderToolbar({ pageSize: 50 });
    // Mantine Select renders the value twice: the hidden
    // form input and the visible text input.
    expect(
      screen.getAllByDisplayValue('50').length
    ).toBeGreaterThan(0);
  });

  it('renders a share button', () => {
    renderToolbar();
    expect(
      screen.getByLabelText('Share tag link')
    ).toBeInTheDocument();
  });

  it('calls onRefresh when the refresh button is clicked',
    () => {
      const { onRefresh } = renderToolbar();

      fireEvent.click(screen.getByLabelText('Refresh notes'));

      expect(onRefresh).toHaveBeenCalledTimes(1);
    });

  it('calls onToggleFolded when the fold button is clicked',
    () => {
      const { onToggleFolded } = renderToolbar();

      fireEvent.click(screen.getByLabelText('Fold verses'));

      expect(onToggleFolded).toHaveBeenCalledTimes(1);
    });
});
