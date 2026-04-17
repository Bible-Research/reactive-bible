/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { renderWithProviders, waitForLoadingToFinish } from '../helpers';
import App from '../../App';

describe('Notes Workflow Integration Test', () => {
  it('should allow a user to add a note to a verse', async () => {
    const user = userEvent.setup();
    const { mockStore } = renderWithProviders(<App />, {
      storeOverrides: {
        activeBook: 'John',
        activeChapter: 3,
      },
    });

    // Wait for the verses to load
    await waitForLoadingToFinish();

    // 2. Click a verse to select it (John 3:16)
    // Find the verse container (not the h3 heading)
    const verseText = await screen.findByText(/For God so loved the world/i);
    // Find the parent verse container that's clickable
    const verseContainer = verseText.closest('[id^="verse-"]') || verseText;
    await user.click(verseContainer);

    // 3. Click the 'Add Note' text (it's clickable text, not a button)
    const addNoteText = screen.getByText(/add note/i);
    await user.click(addNoteText);

    // 4. Fill out and submit the note form
    // Get all inputs with label 'Note' and use the last one (in the modal)
    const noteInputs = screen.getAllByLabelText(/^Note$/i);
    const noteInput = noteInputs[noteInputs.length - 1];
    const saveButton = screen.getByRole('button', { name: /submit/i });

    await user.type(noteInput, 'This is a test note.');
    await user.click(saveButton);

    // 5. Verify the modal closes after submission
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    // 6. Verify the selected verses are cleared
    expect(mockStore.setActiveVerses).toHaveBeenCalledWith([]);
  });
});
