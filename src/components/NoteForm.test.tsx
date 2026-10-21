import '@testing-library/jest-dom';
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
} from 'vitest';
import NoteForm from './NoteForm';
import { Tag } from '../types';
import {
  isTiptapDocString,
  toPlainText,
} from '../utils/tiptapContent';

// ProseMirror needs DOM APIs happy-dom lacks — stub the editor.
vi.mock('./RichTextEditor', async () => ({
  default: (
    await import('../__tests__/mocks/RichTextEditorStub')
  ).default,
}));

// The stub emits `JSON.stringify(getJSON())` like the real
// editor — verify the contract, then compare the text content.
const expectDocText = (arg: unknown, text: string) => {
  expect(typeof arg).toBe('string');
  expect(isTiptapDocString(arg as string)).toBe(true);
  expect(toPlainText(arg as string)).toBe(text);
};

describe('NoteForm Component', () => {
  const mockTags: Tag[] = [
    { id: '1', name: 'Faith', parent_tag: null, 
      created_at: '', updated_at: '' },
    { id: '2', name: 'Hope', parent_tag: null, 
      created_at: '', updated_at: '' },
  ];

  const mockOnSubmit = vi.fn();
  const mockOnTagDropdownOpen = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render form with tag and note inputs', () => {
    render(
      <NoteForm
        tags={mockTags}
        onSubmit={mockOnSubmit}
        submitText="Submit"
        onTagDropdownOpen={mockOnTagDropdownOpen}
      />
    );

    expect(screen.getByLabelText('Tag')).toBeInTheDocument();
    expect(screen.getByLabelText('Note')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Submit' })
    ).toBeInTheDocument();
  });

  it('should render with initial values when note provided', () => {
    render(
      <NoteForm
        tags={mockTags}
        note={{ tagId: '1', text: 'Initial text' }}
        onSubmit={mockOnSubmit}
        submitText="Save"
        onTagDropdownOpen={mockOnTagDropdownOpen}
      />
    );

    const noteInput = screen.getByLabelText('Note') as 
      HTMLInputElement;
    expect(noteInput.value).toBe('Initial text');
  });

  it('should update note text when typing', () => {
    render(
      <NoteForm
        tags={mockTags}
        onSubmit={mockOnSubmit}
        submitText="Submit"
        onTagDropdownOpen={mockOnTagDropdownOpen}
      />
    );

    const noteInput = screen.getByLabelText('Note');
    fireEvent.change(noteInput, 
      { target: { value: 'New note text' } });

    expect((noteInput as HTMLInputElement).value).toBe(
      'New note text'
    );
  });

  it('should dock the submit button in a sticky bar', () => {
    render(
      <NoteForm
        tags={mockTags}
        onSubmit={mockOnSubmit}
        submitText="Submit"
        onTagDropdownOpen={mockOnTagDropdownOpen}
      />
    );

    const submitBar = screen.getByTestId('note-submit-bar');
    const submitButton = screen.getByRole('button', {
      name: 'Submit',
    });
    expect(submitBar).toContainElement(submitButton);
  });

  it('should keep edits when note prop is re-created', () => {
    const note = { tagId: '1', text: 'Initial text' };
    const { rerender } = render(
      <NoteForm
        tags={mockTags}
        note={note}
        onSubmit={mockOnSubmit}
        submitText="Save"
        onTagDropdownOpen={mockOnTagDropdownOpen}
      />
    );

    const noteInput = screen.getByLabelText('Note');
    fireEvent.change(noteInput,
      { target: { value: 'Edited text' } });

    // Parents pass a fresh object literal on every render.
    rerender(
      <NoteForm
        tags={mockTags}
        note={{ ...note }}
        onSubmit={mockOnSubmit}
        submitText="Save"
        onTagDropdownOpen={mockOnTagDropdownOpen}
      />
    );

    expect((noteInput as HTMLTextAreaElement).value).toBe(
      'Edited text'
    );
  });

  it('should re-seed inputs when a different note arrives', () => {
    const { rerender } = render(
      <NoteForm
        tags={mockTags}
        note={{ tagId: '1', text: 'Initial text' }}
        onSubmit={mockOnSubmit}
        submitText="Save"
        onTagDropdownOpen={mockOnTagDropdownOpen}
      />
    );

    // Switching to a different note must re-seed the form.
    rerender(
      <NoteForm
        tags={mockTags}
        note={{ tagId: '2', text: 'Other text' }}
        onSubmit={mockOnSubmit}
        submitText="Save"
        onTagDropdownOpen={mockOnTagDropdownOpen}
      />
    );

    const noteInput = screen.getByLabelText('Note') as
      HTMLTextAreaElement;
    expect(noteInput.value).toBe('Other text');
    const tagInput = screen.getByLabelText('Tag') as
      HTMLInputElement;
    expect(tagInput.value).toBe('Hope');
  });

  it('should not render create new tag button', () => {
    render(
      <NoteForm
        tags={mockTags}
        onSubmit={mockOnSubmit}
        submitText="Submit"
        onTagDropdownOpen={mockOnTagDropdownOpen}
      />
    );

    expect(
      screen.queryByText('Or create a new tag')
    ).not.toBeInTheDocument();
  });

  it('should call onSubmit with correct values', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <NoteForm
        tags={mockTags}
        onSubmit={onSubmit}
        submitText="Submit"
        onTagDropdownOpen={mockOnTagDropdownOpen}
      />
    );

    // Pick a tag through the Select dropdown (items select on
    // mousedown, not click), then type.
    fireEvent.mouseDown(screen.getByLabelText('Tag'));
    fireEvent.mouseDown(
      await screen.findByRole('option', { name: 'Faith' })
    );
    fireEvent.change(screen.getByLabelText('Note'), {
      target: { value: 'Body text' },
    });
    fireEvent.submit(
      screen
        .getByRole('button', { name: 'Submit' })
        .closest('form') as HTMLFormElement
    );

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    const [tagId, text] = onSubmit.mock.calls[0];
    expect(tagId).toBe('1');
    expectDocText(text, 'Body text');
  });

  it('should call onTagDropdownOpen when dropdown opens', () => {
    render(
      <NoteForm
        tags={mockTags}
        onSubmit={mockOnSubmit}
        submitText="Submit"
        onTagDropdownOpen={mockOnTagDropdownOpen}
      />
    );

    fireEvent.mouseDown(screen.getByLabelText('Tag'));
    expect(mockOnTagDropdownOpen).toHaveBeenCalledTimes(1);
  });

  describe('auto save', () => {
    it('hides the checkbox without onAutoSave', () => {
      render(
        <NoteForm
          tags={mockTags}
          onSubmit={mockOnSubmit}
          submitText="Submit"
          onTagDropdownOpen={mockOnTagDropdownOpen}
        />
      );

      expect(
        screen.queryByLabelText('Auto save')
      ).not.toBeInTheDocument();
    });

    it('saves every 5s while enabled', async () => {
      vi.useFakeTimers();
      try {
        const onAutoSave = vi.fn().mockResolvedValue(undefined);
        render(
          <NoteForm
            tags={mockTags}
            note={{ tagId: '1', text: '' }}
            onSubmit={mockOnSubmit}
            submitText="Submit"
            onTagDropdownOpen={mockOnTagDropdownOpen}
            onAutoSave={onAutoSave}
          />
        );

        fireEvent.change(screen.getByLabelText('Note'), {
          target: { value: 'Draft text' },
        });
        fireEvent.click(screen.getByLabelText('Auto save'));

        await act(async () => {
          await vi.advanceTimersByTimeAsync(5000);
        });
        expect(onAutoSave).toHaveBeenCalledTimes(1);
        expect(onAutoSave.mock.calls[0][0]).toBe('1');
        expectDocText(onAutoSave.mock.calls[0][1], 'Draft text');

        // Unchanged content is not re-saved.
        await act(async () => {
          await vi.advanceTimersByTimeAsync(5000);
        });
        expect(onAutoSave).toHaveBeenCalledTimes(1);

        // The next edit is picked up on the following tick.
        fireEvent.change(screen.getByLabelText('Note'), {
          target: { value: 'Draft text updated' },
        });
        await act(async () => {
          await vi.advanceTimersByTimeAsync(5000);
        });
        expect(onAutoSave).toHaveBeenCalledTimes(2);
        expect(onAutoSave.mock.calls[1][0]).toBe('1');
        expectDocText(
          onAutoSave.mock.calls[1][1],
          'Draft text updated'
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it('skips saving while no tag is selected', async () => {
      vi.useFakeTimers();
      try {
        const onAutoSave = vi.fn().mockResolvedValue(undefined);
        render(
          <NoteForm
            tags={mockTags}
            onSubmit={mockOnSubmit}
            submitText="Submit"
            onTagDropdownOpen={mockOnTagDropdownOpen}
            onAutoSave={onAutoSave}
          />
        );

        fireEvent.change(screen.getByLabelText('Note'), {
          target: { value: 'Draft text' },
        });
        fireEvent.click(screen.getByLabelText('Auto save'));

        // With an empty tag id the API would reject every
        // write — autosave must not even try.
        await act(async () => {
          await vi.advanceTimersByTimeAsync(15000);
        });
        expect(onAutoSave).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('skips saving while the note is empty', async () => {
      vi.useFakeTimers();
      try {
        const onAutoSave = vi.fn().mockResolvedValue(undefined);
        render(
          <NoteForm
            tags={mockTags}
            note={{ tagId: '1', text: '' }}
            onSubmit={mockOnSubmit}
            submitText="Submit"
            onTagDropdownOpen={mockOnTagDropdownOpen}
            onAutoSave={onAutoSave}
          />
        );

        fireEvent.click(screen.getByLabelText('Auto save'));

        await act(async () => {
          await vi.advanceTimersByTimeAsync(15000);
        });
        expect(onAutoSave).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('skips ticks while a save is in flight', async () => {
      vi.useFakeTimers();
      try {
        let resolveSave: () => void = () => undefined;
        const onAutoSave = vi.fn().mockImplementation(
          () =>
            new Promise<void>((resolve) => {
              resolveSave = resolve;
            })
        );
        render(
          <NoteForm
            tags={mockTags}
            note={{ tagId: '1', text: '' }}
            onSubmit={mockOnSubmit}
            submitText="Submit"
            onTagDropdownOpen={mockOnTagDropdownOpen}
            onAutoSave={onAutoSave}
          />
        );

        fireEvent.change(screen.getByLabelText('Note'), {
          target: { value: 'Draft text' },
        });
        fireEvent.click(screen.getByLabelText('Auto save'));

        await act(async () => {
          await vi.advanceTimersByTimeAsync(5000);
        });
        expect(onAutoSave).toHaveBeenCalledTimes(1);

        // Two more ticks fire while the save is pending — the
        // in-flight lock must prevent overlapping writes.
        fireEvent.change(screen.getByLabelText('Note'), {
          target: { value: 'Draft text v2' },
        });
        await act(async () => {
          await vi.advanceTimersByTimeAsync(10000);
        });
        expect(onAutoSave).toHaveBeenCalledTimes(1);

        await act(async () => {
          resolveSave();
          await vi.advanceTimersByTimeAsync(0);
        });

        // The next tick saves the latest text.
        await act(async () => {
          await vi.advanceTimersByTimeAsync(5000);
        });
        expect(onAutoSave).toHaveBeenCalledTimes(2);
        expectDocText(
          onAutoSave.mock.calls[1][1],
          'Draft text v2'
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it('flashes the saved indicator briefly after a save',
      async () => {
      vi.useFakeTimers();
      try {
        const onAutoSave = vi.fn().mockResolvedValue(undefined);
        render(
          <NoteForm
            tags={mockTags}
            note={{ tagId: '1', text: '' }}
            onSubmit={mockOnSubmit}
            submitText="Submit"
            onTagDropdownOpen={mockOnTagDropdownOpen}
            onAutoSave={onAutoSave}
          />
        );

        fireEvent.change(screen.getByLabelText('Note'), {
          target: { value: 'Draft text' },
        });
        fireEvent.click(screen.getByLabelText('Auto save'));

        // The Affix portals to body; the check icon marks it.
        const flashIcon = () =>
          document.querySelector('svg.tabler-icon-check');
        expect(flashIcon()).toBeNull();

        await act(async () => {
          await vi.advanceTimersByTimeAsync(5000);
        });
        expect(onAutoSave).toHaveBeenCalledTimes(1);
        expect(flashIcon()).not.toBeNull();

        await act(async () => {
          await vi.advanceTimersByTimeAsync(500);
        });
        expect(flashIcon()).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it('flushes the unsaved tail on unmount', async () => {
      const onAutoSave = vi.fn().mockResolvedValue(undefined);
      const onUnmountedSave = vi.fn();
      const { unmount } = render(
        <NoteForm
          tags={mockTags}
          note={{ tagId: '1', text: '' }}
          onSubmit={mockOnSubmit}
          submitText="Submit"
          onTagDropdownOpen={mockOnTagDropdownOpen}
          onAutoSave={onAutoSave}
          onUnmountedSave={onUnmountedSave}
        />
      );

      fireEvent.change(screen.getByLabelText('Note'), {
        target: { value: 'Typed then closed quickly' },
      });
      fireEvent.click(screen.getByLabelText('Auto save'));

      // Closing inside the 5s window must not drop the text.
      unmount();
      await act(async () => {
        await Promise.resolve();
      });
      expect(onAutoSave.mock.calls[0][0]).toBe('1');
      expectDocText(
        onAutoSave.mock.calls[0][1],
        'Typed then closed quickly'
      );
      expect(onUnmountedSave).toHaveBeenCalled();
    });

    it('does not flush on unmount when auto save is off',
      async () => {
      const onAutoSave = vi.fn().mockResolvedValue(undefined);
      const onUnmountedSave = vi.fn();
      const { unmount } = render(
        <NoteForm
          tags={mockTags}
          note={{ tagId: '1', text: '' }}
          onSubmit={mockOnSubmit}
          submitText="Submit"
          onTagDropdownOpen={mockOnTagDropdownOpen}
          onAutoSave={onAutoSave}
          onUnmountedSave={onUnmountedSave}
        />
      );

      fireEvent.change(screen.getByLabelText('Note'), {
        target: { value: 'Typed then closed' },
      });

      unmount();
      await act(async () => {
        await Promise.resolve();
      });
      expect(onAutoSave).not.toHaveBeenCalled();
      expect(onUnmountedSave).not.toHaveBeenCalled();
    });

    it('retries a declined save on the next tick', async () => {
      vi.useFakeTimers();
      try {
        const onAutoSave = vi.fn().mockResolvedValue(false);
        render(
          <NoteForm
            tags={mockTags}
            note={{ tagId: '1', text: '' }}
            onSubmit={mockOnSubmit}
            submitText="Submit"
            onTagDropdownOpen={mockOnTagDropdownOpen}
            onAutoSave={onAutoSave}
          />
        );

        fireEvent.change(screen.getByLabelText('Note'), {
          target: { value: 'Draft text' },
        });
        fireEvent.click(screen.getByLabelText('Auto save'));

        await act(async () => {
          await vi.advanceTimersByTimeAsync(5000);
        });
        expect(onAutoSave).toHaveBeenCalledTimes(1);

        // The save resolved false — nothing was persisted, so
        // the content stays dirty and the next tick retries
        // instead of marking it saved.
        await act(async () => {
          await vi.advanceTimersByTimeAsync(5000);
        });
        expect(onAutoSave).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it('skips the unmount flush when an in-flight submit ' +
      'persisted the content', async () => {
      let resolveSubmit: (value: boolean) => void =
        () => undefined;
      const onSubmit = vi.fn(
        () =>
          new Promise<boolean>((resolve) => {
            resolveSubmit = resolve;
          })
      );
      const onAutoSave = vi.fn().mockResolvedValue(true);
      const { unmount } = render(
        <NoteForm
          tags={mockTags}
          note={{ tagId: '1', text: '' }}
          onSubmit={onSubmit}
          submitText="Submit"
          onTagDropdownOpen={mockOnTagDropdownOpen}
          onAutoSave={onAutoSave}
        />
      );

      fireEvent.change(screen.getByLabelText('Note'), {
        target: { value: 'Draft text' },
      });
      fireEvent.click(screen.getByLabelText('Auto save'));
      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: 'Submit' })
        );
        // Let handleSubmit reach trackInFlight so the
        // unmount flush chains behind the pending submit.
        await Promise.resolve();
      });

      // Close while the submit is still in flight.
      unmount();
      await act(async () => {
        resolveSubmit(true);
        // Flush every queued microtask continuation.
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
      });

      // The submit persisted the content — the flush must
      // not save it again.
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onAutoSave).not.toHaveBeenCalled();
    });

    it('stops saving when the checkbox is unchecked',
      async () => {
      vi.useFakeTimers();
      try {
        const onAutoSave = vi.fn().mockResolvedValue(undefined);
        render(
          <NoteForm
            tags={mockTags}
            note={{ tagId: '1', text: '' }}
            onSubmit={mockOnSubmit}
            submitText="Submit"
            onTagDropdownOpen={mockOnTagDropdownOpen}
            onAutoSave={onAutoSave}
          />
        );

        fireEvent.change(screen.getByLabelText('Note'), {
          target: { value: 'Draft text' },
        });
        const checkbox = screen.getByLabelText('Auto save');
        fireEvent.click(checkbox);
        await act(async () => {
          await vi.advanceTimersByTimeAsync(5000);
        });
        expect(onAutoSave).toHaveBeenCalledTimes(1);

        fireEvent.click(checkbox);
        await act(async () => {
          await vi.advanceTimersByTimeAsync(10000);
        });
        expect(onAutoSave).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
