/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { renderWithProviders, waitForLoadingToFinish } from '../helpers';
import App from '../../App';

describe.skip('Notes Workflow Integration Test', () => {
  it('should allow a user to add a note to a verse', async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />);

    // Open the navigation menu
    const burgerButton = screen.getByRole('button', { name: /open navigation/i });
    await user.click(burgerButton);

    // Navigate to John 3
    const johnLink = await screen.findByRole('link', { name: /John/i });
    await user.click(johnLink);

    const chapter3Link = await screen.findByRole('link', { name: /3/i });
    await user.click(chapter3Link);

    // 2. Click a verse to select it (John 3:16)
    const verse = await screen.findByText(/For God so loved the world/i);
    await user.click(verse);

    // 3. Click the 'Add Note' button
    const addNoteButton = screen.getByRole('button', { name: /add note/i });
    await user.click(addNoteButton);

    // 4. Fill out and submit the note form
    const noteTextarea = screen.getByPlaceholderText(/your note/i);
    const saveButton = screen.getByRole('button', { name: /save/i });

    await user.type(noteTextarea, 'This is a test note.');
    await user.click(saveButton);

    // 5. Verify the new note appears in the notes view
    const noteCard = await screen.findByText(/this is a test note/i);
    expect(noteCard).toBeInTheDocument();
  });
});
