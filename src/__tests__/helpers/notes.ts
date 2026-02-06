import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockTags } from '../handlers';
import '@testing-library/jest-dom';

export async function waitForSearchForm() {
  await waitFor(() => {
    expect(screen.getByPlaceholderText('Enter keywords...')).toBeInTheDocument();
  });
  await waitFor(() => {
    expect(screen.getByText('Filter by Tag (Optional)')).toBeInTheDocument();
  });
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /search/i })).toBeInTheDocument();
  });
}

export async function fillSearchForm(query: string, tagId?: string) {
  const user = userEvent.setup();
  await waitForSearchForm();
  const searchInput = screen.getByPlaceholderText('Enter keywords...');
  if (query) {
    await user.type(searchInput, query);
  }

  // Select tag if provided
  if (tagId) {
    const tagSelect = screen.getByPlaceholderText('All tags');
    await user.click(tagSelect);
    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });
    await user.click(screen.getByText(mockTags[0].name));
  }

  const searchButton = screen.getByRole('button', { name: /search/i });
  await user.click(searchButton);
}

export async function waitForSearchResults(expectedCount: number) {
  if (expectedCount === 0) {
    await waitFor(() => {
      expect(screen.getByText(/no notes found/i)).toBeInTheDocument();
    });
  } else {
    await waitFor(() => {
      expect(screen.getByText(`Found ${expectedCount} note(s)`)).toBeInTheDocument();
    });
  }
}
