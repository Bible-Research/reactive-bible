import { describe, it, expect, vi } from 'vitest';
import {
  screen,
  fireEvent,
} from '@testing-library/react';
import { renderWithProviders } from '../__tests__/helpers';
import NoteOrderMenu from './NoteOrderMenu';
import {
  LabeledNoteOrderEntry,
  NoteOrderIndexEntry,
  NoteOrderMenuData,
} from '../types';

const entries: NoteOrderIndexEntry[] = [
  {
    id: 'n1',
    tag_position: 1,
    book: 'John',
    chapter: 3,
    verse_start: 16,
    verse_end: 18,
  },
  {
    id: 'n2',
    tag_position: 2,
    book: 'Genesis',
    chapter: 1,
    verse_start: 1,
    verse_end: 1,
  },
  {
    id: 'n3',
    tag_position: 3,
    book: null,
    chapter: null,
    verse_start: null,
    verse_end: null,
  },
];

// Labels are precomputed by TagNotesRoute in production;
// literals keep this fixture independent of that mapping.
const labeledEntries: LabeledNoteOrderEntry[] = [
  { entry: entries[0], label: '#1 — John 3:16-18' },
  { entry: entries[1], label: '#2 — Genesis 1:1' },
  { entry: entries[2], label: '#3 — no passage' },
];

const buildData = (
  overrides: Partial<NoteOrderMenuData> = {}
): NoteOrderMenuData => ({
  labeledEntries,
  orderIdByNoteId: new Map([
    ['n1', 1],
    ['n2', 2],
    ['n3', 3],
  ]),
  topOrderId: 1,
  onMoveAfter: vi.fn(),
  onMoveToTop: vi.fn(),
  ...overrides,
});

const openMenu = (noteId = 'n1') => {
  fireEvent.click(screen.getByLabelText(`note-order-${noteId}`));
};

describe('NoteOrderMenu', () => {
  it('renders the order badge', () => {
    renderWithProviders(
      <NoteOrderMenu noteId="n1" orderId={1} data={buildData()} />
    );
    expect(
      screen.getByLabelText('note-order-n1')
    ).toHaveTextContent('#1');
  });

  it('lists every entry with passage labels and ' +
    'a move-to-top item', async () => {
    renderWithProviders(
      <NoteOrderMenu noteId="n1" orderId={1} data={buildData()} />
    );
    openMenu();

    expect(
      await screen.findByText('#1 — John 3:16-18')
    ).toBeInTheDocument();
    expect(
      screen.getByText('#2 — Genesis 1:1')
    ).toBeInTheDocument();
    expect(
      screen.getByText('#3 — no passage')
    ).toBeInTheDocument();
    expect(screen.getByText('Move to top')).toBeInTheDocument();
  });

  it('narrows the list when filtering by passage text',
    async () => {
      renderWithProviders(
        <NoteOrderMenu
          noteId="n1"
          orderId={1}
          data={buildData()}
        />
      );
      openMenu();
      await screen.findByText('#1 — John 3:16-18');

      fireEvent.change(
        screen.getByLabelText('filter-note-order'),
        { target: { value: 'genesis' } }
      );

      expect(
        screen.getByText('#2 — Genesis 1:1')
      ).toBeInTheDocument();
      expect(
        screen.queryByText('#1 — John 3:16-18')
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText('#3 — no passage')
      ).not.toBeInTheDocument();
    });

  it('narrows the list when filtering by order id', async () => {
    renderWithProviders(
      <NoteOrderMenu noteId="n1" orderId={1} data={buildData()} />
    );
    openMenu();
    await screen.findByText('#1 — John 3:16-18');

    fireEvent.change(
      screen.getByLabelText('filter-note-order'),
      { target: { value: '#3' } }
    );

    expect(
      screen.getByText('#3 — no passage')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('#2 — Genesis 1:1')
    ).not.toBeInTheDocument();
  });

  it('calls onMoveAfter with note and target ids when an ' +
    'entry is clicked', async () => {
    const onMoveAfter = vi.fn();
    renderWithProviders(
      <NoteOrderMenu
        noteId="n1"
        orderId={1}
        data={buildData({ onMoveAfter })}
      />
    );
    openMenu();
    fireEvent.click(await screen.findByText('#2 — Genesis 1:1'));

    expect(onMoveAfter).toHaveBeenCalledWith('n1', 'n2');
  });

  it('calls onMoveToTop when the move-to-top item is clicked',
    async () => {
      const onMoveToTop = vi.fn();
      renderWithProviders(
        <NoteOrderMenu
          noteId="n2"
          orderId={2}
          data={buildData({ onMoveToTop })}
        />
      );
      openMenu('n2');
      fireEvent.click(await screen.findByText('Move to top'));

      expect(onMoveToTop).toHaveBeenCalledWith('n2');
    });

  it('disables move-to-top for the visually first note ' +
    'ascending', async () => {
      renderWithProviders(
        <NoteOrderMenu
          noteId="n1"
          orderId={1}
          data={buildData({ topOrderId: 1 })}
        />
      );
      openMenu('n1');

      const item = await screen.findByText('Move to top');
      expect(item.closest('button')).toBeDisabled();
    });

  it('disables move-to-top for the visually first note ' +
    'descending', async () => {
      // In custom_desc the visual top is the highest order ID.
      renderWithProviders(
        <NoteOrderMenu
          noteId="n3"
          orderId={3}
          data={buildData({ topOrderId: 3 })}
        />
      );
      openMenu('n3');

      const item = await screen.findByText('Move to top');
      expect(item.closest('button')).toBeDisabled();
    });

  it('clears the filter when the menu is closed and ' +
    'reopened', async () => {
      renderWithProviders(
        <NoteOrderMenu
          noteId="n2"
          orderId={2}
          data={buildData()}
        />
      );
      openMenu('n2');
      fireEvent.change(
        await screen.findByLabelText('filter-note-order'),
        { target: { value: 'genesis' } }
      );

      // Close via the badge toggle, then reopen.
      fireEvent.click(screen.getByLabelText('note-order-n2'));
      openMenu('n2');

      expect(
        await screen.findByLabelText('filter-note-order')
      ).toHaveValue('');
    });

  it('disables the note\'s own entry', async () => {
    const onMoveAfter = vi.fn();
    renderWithProviders(
      <NoteOrderMenu
        noteId="n1"
        orderId={1}
        data={buildData({ onMoveAfter })}
      />
    );
    openMenu();

    const ownItem = await screen.findByText('#1 — John 3:16-18');
    expect(ownItem.closest('button')).toBeDisabled();
    fireEvent.click(ownItem);
    expect(onMoveAfter).not.toHaveBeenCalled();
  });
});
