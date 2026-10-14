import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import { showNotification } from '@mantine/notifications';
import { CreateTagModal } from '../CreateTagModal';
import { mockDomApis } from '../../__tests__/helpers';
import { Tag } from '../../types';
import * as api from '../../api';

// Selective automock — the modal's only api call is createTag.
vi.mock('../../api', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../api')>();
  const mocked: Record<string, unknown> = { ...actual };
  for (const [key, value] of Object.entries(actual)) {
    if (typeof value === 'function') {
      mocked[key] = vi.fn();
    }
  }
  return mocked;
});

vi.mock('@mantine/notifications', () => ({
  showNotification: vi.fn(),
}));

const mockApi = vi.mocked(api);

const makeTag = (
  id: string,
  name: string,
  parentTag: string | null = null
): Tag => ({
  id,
  name,
  parent_tag: parentTag,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
});

const renderModal = ({
  existingTags = [makeTag('tag-a', 'Alpha')],
  onClose = vi.fn(),
  onSuccess = vi.fn(),
}: {
  existingTags?: Tag[];
  onClose?: () => void;
  onSuccess?: () => void;
} = {}) => {
  mockDomApis();
  render(
    <CreateTagModal
      opened
      onClose={onClose}
      onSuccess={onSuccess}
      existingTags={existingTags}
    />
  );
  return { onClose, onSuccess };
};

const submitForm = () =>
  fireEvent.click(
    screen.getByRole('button', { name: 'Create Tag' })
  );

describe('CreateTagModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.createTag.mockResolvedValue(
      makeTag('tag-new', 'New')
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a tag with the trimmed name and no parent',
    async () => {
      const { onClose, onSuccess } = renderModal();

      fireEvent.change(screen.getByLabelText(/Tag Name/), {
        target: { value: '  Devotionals  ' },
      });
      submitForm();

      await waitFor(() => {
        expect(mockApi.createTag).toHaveBeenCalledWith(
          'Devotionals',
          null
        );
      });
      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
      expect(showNotification).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Success' })
      );
    });

  it('requires a tag name', async () => {
    renderModal();

    // The input is `required`, so a click-submit is blocked by
    // native constraint validation before onSubmit runs.
    submitForm();
    expect(mockApi.createTag).not.toHaveBeenCalled();

    // The component's own validation surfaces on blur…
    fireEvent.blur(screen.getByLabelText(/Tag Name/));
    await screen.findByText('Tag name is required');

    // …and on a submit that bypasses native validation.
    const form = document.querySelector('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);
    await screen.findByText('Tag name is required');
    expect(mockApi.createTag).not.toHaveBeenCalled();
  });

  it('rejects a duplicate tag name case-insensitively',
    async () => {
      renderModal();

      fireEvent.change(screen.getByLabelText(/Tag Name/), {
        target: { value: 'ALPHA' },
      });
      submitForm();

      await waitFor(() => {
        expect(
          screen.getByText('A tag with this name already exists')
        ).toBeInTheDocument();
      });
      expect(mockApi.createTag).not.toHaveBeenCalled();
    });

  it('clears a stale error once the name becomes valid',
    async () => {
      renderModal();

      // Trigger the duplicate error first…
      fireEvent.change(screen.getByLabelText(/Tag Name/), {
        target: { value: 'alpha' },
      });
      submitForm();
      await screen.findByText(
        'A tag with this name already exists'
      );

      // …then fix it — onChange revalidates because an error
      // is already showing.
      fireEvent.change(screen.getByLabelText(/Tag Name/), {
        target: { value: 'Unique name' },
      });
      submitForm();

      await waitFor(() => {
        expect(mockApi.createTag).toHaveBeenCalledWith(
          'Unique name',
          null
        );
      });
    });

  it('flags names over 100 characters', async () => {
    renderModal();

    // fireEvent.change bypasses the input's maxLength; a
    // click-submit is blocked by native maxLength validation,
    // so dispatch submit directly to exercise the component's
    // own guard.
    fireEvent.change(screen.getByLabelText(/Tag Name/), {
      target: { value: 'x'.repeat(101) },
    });
    const form = document.querySelector('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);

    await screen.findByText(
      'Tag name must be 100 characters or less'
    );
    expect(mockApi.createTag).not.toHaveBeenCalled();
  });

  it('shows an error notification and stays open when ' +
    'creation fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(
        () => undefined
      );
      mockApi.createTag.mockRejectedValue(new Error('boom'));
      const { onClose } = renderModal();

      fireEvent.change(screen.getByLabelText(/Tag Name/), {
        target: { value: 'Valid' },
      });
      submitForm();

      await waitFor(() => {
        expect(showNotification).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Error',
            color: 'red',
          })
        );
      });
      expect(onClose).not.toHaveBeenCalled();
    });
});
