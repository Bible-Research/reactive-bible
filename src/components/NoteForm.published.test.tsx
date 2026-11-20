import '@testing-library/jest-dom';
import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import NoteForm from './NoteForm';
import {
  renderWithProviders,
  mockDomApis,
} from '../__tests__/helpers';
import * as api from '../api';

// ProseMirror needs DOM APIs happy-dom lacks — stub the
// editor the same way the modal suites do.
vi.mock('./RichTextEditor', async () => ({
  default: (
    await import('../__tests__/mocks/RichTextEditorStub')
  ).default,
}));

const tag = {
  id: 't1',
  name: 'Study',
  parent_tag: null,
  public: false,
  created_at: '',
  updated_at: '',
};

const renderForm = (
  authStoreState: Record<string, unknown> = {},
  props: Partial<React.ComponentProps<typeof NoteForm>> = {}
) =>
  renderWithProviders(
    <NoteForm
      tags={[tag]}
      onSubmit={vi.fn()}
      submitText="Save"
      onTagDropdownOpen={vi.fn()}
      {...props}
    />,
    {
      authStoreState: {
        isAuthenticated: true,
        token: 't',
        ...authStoreState,
      },
    }
  );

describe('NoteForm publish gating', () => {
  beforeEach(() => {
    mockDomApis();
    vi.restoreAllMocks();
    vi.spyOn(api, 'editNote').mockResolvedValue({} as never);
  });

  it('hides the published toggle without can_publish', () => {
    renderForm({ user: { id: 1, username: 'u' } });

    expect(
      screen.queryByRole('checkbox', { name: 'Published note' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'Public note' })
    ).toBeInTheDocument();
  });

  it('shows the toggle and locks the public box while ' +
    'published', () => {
    renderForm({
      user: { id: 1, username: 'u', can_publish: true },
    });

    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Published note' })
    );

    // Checking published forces + locks the public box.
    const publicBox = screen.getByRole('checkbox', {
      name: 'Public note',
    });
    expect(publicBox).toBeChecked();
    expect(publicBox).toBeDisabled();
  });
});
