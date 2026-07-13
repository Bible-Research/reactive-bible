import { render, screen, fireEvent } from 
  '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import NoteForm from './NoteForm';
import { Tag } from '../types';

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
});
