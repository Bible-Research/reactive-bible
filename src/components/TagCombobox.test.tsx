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
import { useState } from 'react';
import { Notifications } from '@mantine/notifications';
import { TagCombobox } from './TagCombobox';
import type { Tag } from '../types';
import { createTag, reparentTag } from '../api';

vi.mock('../api', () => ({
  createTag: vi.fn(),
  deleteTag: vi.fn(),
  getTags: vi.fn(),
  reparentTag: vi.fn(),
}));

vi.mock('../store', () => ({
  useBibleStore: {
    getState: vi.fn(() => ({
      getTags: vi.fn().mockResolvedValue(undefined),
      tags: [],
    })),
  },
}));

const tag = (
  id: string,
  name: string,
  parent_tag: string | null = null,
  note_count = 0
): Tag => ({
  id,
  name,
  parent_tag,
  note_count,
  public: false,
  created_at: '',
  updated_at: '',
});

const baseTags: Tag[] = [
  tag('1', 'Work'),
  tag('2', 'design', '1'),
  tag('3', 'School'),
];

const mockedCreate = vi.mocked(createTag);
const mockedReparent = vi.mocked(reparentTag);

const renderCombobox = (
  props: Partial<
    React.ComponentProps<typeof TagCombobox>
  > = {}
) => {
  const onChange = props.onChange ?? vi.fn();
  // Stateful harness — the real NoteForm feeds onChange
  // back into `value`, and Undo depends on that.
  const Harness = () => {
    const [v, setV] = useState(props.value ?? '');
    return (
      <>
        <Notifications />
        <TagCombobox
          tags={baseTags}
          {...props}
          value={v}
          onChange={(id) => {
            setV(id);
            onChange(id);
          }}
        />
      </>
    );
  };
  render(<Harness />);
  return { onChange };
};

const input = () => screen.getByLabelText('Tag');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('options view', () => {
  it('lists tags with full-path labels', async () => {
    renderCombobox();
    fireEvent.mouseDown(input());
    expect(
      await screen.findByRole('option', {
        name: 'Work › design',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Work' })
    ).toBeInTheDocument();
  });

  it('shows both create rows for a new name', async () => {
    renderCombobox();
    fireEvent.mouseDown(input());
    fireEvent.change(input(), {
      target: { value: 'prayer' },
    });
    expect(
      await screen.findByRole('option', {
        name: '+ Create "prayer"',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', {
        name: '+ Create "prayer" under…',
      })
    ).toBeInTheDocument();
  });

  it('hides direct create on a top-level duplicate', () => {
    renderCombobox({ tags: [tag('4', 'Other')] });
    fireEvent.mouseDown(input());
    fireEvent.change(input(), {
      target: { value: 'other' },
    });
    expect(
      screen.queryByRole('option', {
        name: '+ Create "other"',
      })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('option', {
        name: '+ Create "other" under…',
      })
    ).toBeInTheDocument();
  });

  it('suppresses create rows on an exact slash path', () => {
    renderCombobox();
    fireEvent.mouseDown(input());
    fireEvent.change(input(), {
      target: { value: 'Work/design' },
    });
    expect(
      screen.queryByRole('option', { name: /^\+ Create/ })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Work › design' })
    ).toBeInTheDocument();
  });

  it('keeps under… for a literal top-level duplicate', () => {
    renderCombobox();
    fireEvent.mouseDown(input());
    fireEvent.change(input(), {
      target: { value: 'School' },
    });
    expect(
      screen.queryByRole('option', {
        name: '+ Create "School"',
      })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('option', {
        name: '+ Create "School" under…',
      })
    ).toBeInTheDocument();
  });

  it('exposes combobox/listbox/option ARIA roles', async () => {
    renderCombobox();
    const field = input();
    expect(field).toHaveAttribute('role', 'combobox');
    expect(field).toHaveAttribute('aria-expanded', 'false');
    fireEvent.mouseDown(field);
    expect(field).toHaveAttribute('aria-expanded', 'true');
    expect(
      await screen.findByRole('listbox')
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('option').length
    ).toBeGreaterThan(0);
  });

  it('selects an existing tag on mousedown', async () => {
    const { onChange } = renderCombobox();
    fireEvent.mouseDown(input());
    fireEvent.mouseDown(
      await screen.findByRole('option', { name: 'Work' })
    );
    expect(onChange).toHaveBeenCalledWith('1');
  });
});

describe('top-level create', () => {
  it('creates and selects the tag on Enter', async () => {
    const made = tag('9', 'prayer');
    mockedCreate.mockResolvedValue(made);
    const { onChange } = renderCombobox();
    fireEvent.mouseDown(input());
    fireEvent.change(input(), {
      target: { value: 'prayer' },
    });
    const row = await screen.findByRole('option', {
      name: '+ Create "prayer"',
    });
    fireEvent.mouseDown(row);
    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalledWith(
        'prayer',
        null
      );
    });
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('9');
    });
  });
});

describe('parent picker', () => {
  const openPicker = async () => {
    fireEvent.mouseDown(input());
    fireEvent.change(input(), {
      target: { value: 'docs' },
    });
    const row = await screen.findByRole('option', {
      name: '+ Create "docs" under…',
    });
    fireEvent.mouseDown(row);
    await screen.findByText('Create “docs” under:');
  };

  it('opens on Right Arrow from the under… row', async () => {
    renderCombobox();
    const field = input();
    fireEvent.mouseDown(field);
    fireEvent.change(field, {
      target: { value: 'docs' },
    });
    // Highlight the under… row: last option.
    const options = screen.getAllByRole('option');
    const last = options.length - 1;
    for (let i = 0; i < last; i += 1) {
      fireEvent.keyDown(field, { key: 'ArrowDown' });
    }
    fireEvent.keyDown(field, { key: 'ArrowRight' });
    await screen.findByText('Create “docs” under:');
  });

  it('creates under the picked parent', async () => {
    mockedCreate.mockResolvedValue(tag('9', 'docs', '1'));
    const { onChange } = renderCombobox();
    await openPicker();
    fireEvent.mouseDown(
      await screen.findByRole('option', { name: 'Work' })
    );
    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalledWith('docs', '1');
    });
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('9');
    });
  });

  it('filters parents by typing', async () => {
    renderCombobox();
    await openPicker();
    fireEvent.change(input(), {
      target: { value: 'sch' },
    });
    expect(
      screen.queryByRole('option', { name: 'Work' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'School' })
    ).toBeInTheDocument();
  });

  it('Esc returns to options with the query intact', async () => {
    renderCombobox();
    await openPicker();
    fireEvent.keyDown(input(), { key: 'Escape' });
    expect(
      await screen.findByRole('option', {
        name: '+ Create "docs" under…',
      })
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Create “docs” under:')
    ).not.toBeInTheDocument();
  });
});

describe('path creation', () => {
  it('reuses ancestors and creates the tail', async () => {
    mockedCreate.mockResolvedValue(tag('9', 'ui', '2'));
    const { onChange } = renderCombobox();
    fireEvent.mouseDown(input());
    fireEvent.change(input(), {
      target: { value: 'Work/design/ui' },
    });
    fireEvent.mouseDown(
      await screen.findByRole('option', {
        name: '+ Create "Work/design/ui"',
      })
    );
    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalledWith('ui', '2');
    });
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('9');
    });
  });
});

describe('post-create toast', () => {
  const create = async (
    props: Partial<
      React.ComponentProps<typeof TagCombobox>
    > = {}
  ) => {
    mockedCreate.mockResolvedValue(tag('9', 'prayer'));
    const onChange = vi.fn();
    renderCombobox({ onChange, ...props });
    fireEvent.mouseDown(input());
    fireEvent.change(input(), {
      target: { value: 'prayer' },
    });
    fireEvent.mouseDown(
      await screen.findByRole('option', {
        name: '+ Create "prayer"',
      })
    );
    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalled();
    });
    return { onChange };
  };

  it('announces the new path in a status region', async () => {
    await create();
    expect(
      await screen.findByRole('status')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Undo' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Move under…',
      })
    ).toBeInTheDocument();
  });

  it('Undo deletes the created tag and reverts', async () => {
    const { onChange } = await create();
    const { deleteTag, getTags } = await import('../api');
    vi.mocked(getTags).mockResolvedValue([
      tag('9', 'prayer'),
    ]);
    fireEvent.click(
      screen.getByRole('button', { name: 'Undo' })
    );
    await waitFor(() => {
      expect(deleteTag).toHaveBeenCalledWith('9');
    });
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('');
    });
  });

  it('Move under… re-parents the new tag', async () => {
    // Include a descendant of the created tag — it must be
    // excluded (moving under it would create a cycle). The
    // created '9' itself isn't in the fixture — the store
    // refresh hasn't landed yet.
    await create({
      tags: [...baseTags, tag('10', 'prayerbaby', '9')],
    });
    mockedReparent.mockResolvedValue(tag('9', 'prayer'));
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Move under…',
      })
    );
    // The dropdown reopens in the move pane — same
    // searchable parent list, minus the tag itself and its
    // descendants — and the action toast disarms.
    const pane = await screen.findByRole('listbox', {
      name: 'Move "prayer" under',
    });
    expect(
      within(pane).queryByRole('option', { name: 'prayer' })
    ).not.toBeInTheDocument();
    expect(
      within(pane).queryByRole('option', {
        name: 'prayerbaby',
      })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Undo' })
    ).not.toBeInTheDocument();
    fireEvent.mouseDown(
      await within(pane).findByRole('option', {
        name: 'Work',
      })
    );
    await waitFor(() => {
      expect(mockedReparent).toHaveBeenCalledWith('9', '1');
    });
  });
});
