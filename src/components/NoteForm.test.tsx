import '@testing-library/jest-dom';
import { act, render, screen, fireEvent } from
  '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import NoteForm from './NoteForm';
import { Tag } from '../types';

// ProseMirror needs DOM APIs happy-dom lacks — stub the editor.
vi.mock('./RichTextEditor', async () => ({
  default: (
    await import('../__tests__/mocks/RichTextEditorStub')
  ).default,
}));

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

  // Note: Testing Select dropdown interactions is problematic
  // due to portal rendering. See SKIPPED_TESTS.md for details.
  it.skip('should call onSubmit with correct values', () => {
    // This test is skipped due to Select portal rendering
  });

  it.skip('should call onTagDropdownOpen when dropdown opens',
    () => {
    // This test is skipped due to Select portal rendering
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
        expect(onAutoSave).toHaveBeenCalledWith('1', 'Draft text');

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
        expect(onAutoSave).toHaveBeenLastCalledWith(
          '1',
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
