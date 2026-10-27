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
import { EditTagModal } from './EditTagModal';
import { mockDomApis } from '../__tests__/helpers';
import { Tag } from '../types';
import * as api from '../api';

// Selective automock — the modal's only api call is updateTag,
// but mocking the whole module keeps future imports safe and
// preserves real error classes.
vi.mock('../api', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../api')>();
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
  public: false,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
});

const renderModal = ({
  tag = makeTag('tag-a', 'Alpha'),
  existingTags = [
    makeTag('tag-a', 'Alpha'),
    makeTag('tag-b', 'Beta'),
  ],
  onClose = vi.fn(),
  onSuccess = vi.fn(),
}: {
  tag?: Tag;
  existingTags?: Tag[];
  onClose?: () => void;
  onSuccess?: () => void;
} = {}) => {
  mockDomApis();
  render(
    <EditTagModal
      opened
      onClose={onClose}
      onSuccess={onSuccess}
      tag={tag}
      existingTags={existingTags}
    />
  );
  return { onClose, onSuccess };
};

const submitForm = () =>
  fireEvent.click(
    screen.getByRole('button', { name: 'Save Changes' })
  );

describe('EditTagModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.updateTag.mockResolvedValue(
      makeTag('tag-a', 'Alpha')
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('populates the form with the tag being edited', () => {
    renderModal();

    expect(screen.getByLabelText(/Tag Name/)).toHaveValue(
      'Alpha'
    );
  });

  it('submits the trimmed name and calls onSuccess/onClose',
    async () => {
      const { onClose, onSuccess } = renderModal();

      fireEvent.change(screen.getByLabelText(/Tag Name/), {
        target: { value: '  Renamed  ' },
      });
      submitForm();

      await waitFor(() => {
        expect(mockApi.updateTag).toHaveBeenCalledWith(
          'tag-a',
          'Renamed',
          null
        );
      });
      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
      expect(showNotification).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Success' })
      );
    });

  it('rejects an empty tag name', async () => {
    renderModal();

    fireEvent.change(screen.getByLabelText(/Tag Name/), {
      target: { value: '   ' },
    });
    submitForm();

    await waitFor(() => {
      expect(
        screen.getByText('Tag name is required')
      ).toBeInTheDocument();
    });
    expect(mockApi.updateTag).not.toHaveBeenCalled();
  });

  it('rejects a duplicate tag name case-insensitively',
    async () => {
      renderModal();

      fireEvent.change(screen.getByLabelText(/Tag Name/), {
        target: { value: 'beta' },
      });
      submitForm();

      await waitFor(() => {
        expect(
          screen.getByText('A tag with this name already exists')
        ).toBeInTheDocument();
      });
      expect(mockApi.updateTag).not.toHaveBeenCalled();
    });

  it('accepts the tag\'s own name unchanged — and skips ' +
    'the no-op PATCH', async () => {
      const { onClose, onSuccess } = renderModal();

      submitForm();

      // Keeping the same name must not trip the duplicate
      // check — the submit still succeeds and closes.
      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalled();
      });
      expect(onClose).toHaveBeenCalled();
      // Name and parent are unchanged, so updateTag must not
      // fire a no-op PATCH.
      expect(mockApi.updateTag).not.toHaveBeenCalled();
      expect(mockApi.setTagPublic).not.toHaveBeenCalled();
    });

  it('blocks a circular parent relationship against the ' +
    'real canSetParent/isDescendant chain', async () => {
      // tag-c -> tag-b -> tag-a: tag-a already has tag-c as
      // its stored parent. Submitting unchanged exercises
      // canSetParent('tag-c'), which walks tag-c's ancestor
      // chain (tag-c -> tag-b -> tag-a), finds tag-a itself,
      // and rejects the circular relationship.
      const tags = [
        makeTag('tag-a', 'Alpha', 'tag-c'),
        makeTag('tag-b', 'Beta', 'tag-a'),
        makeTag('tag-c', 'Gamma', 'tag-b'),
      ];
      renderModal({
        tag: tags[0],
        existingTags: tags,
      });

      submitForm();

      await waitFor(() => {
        expect(showNotification).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Invalid Parent',
            color: 'red',
          })
        );
      });
      expect(mockApi.updateTag).not.toHaveBeenCalled();
    });

  it('accepts a non-descendant parent', async () => {
    // tag-a parented to tag-c where tag-c is a root — legal.
    const tags = [
      makeTag('tag-a', 'Alpha', 'tag-c'),
      makeTag('tag-b', 'Beta'),
      makeTag('tag-c', 'Gamma'),
    ];
    renderModal({
      tag: tags[0],
      existingTags: tags,
    });

    // Rename so the PATCH path runs — the unchanged
    // non-descendant parent rides along.
    fireEvent.change(screen.getByLabelText(/Tag Name/), {
      target: { value: 'Renamed' },
    });
    submitForm();

    await waitFor(() => {
      expect(mockApi.updateTag).toHaveBeenCalledWith(
        'tag-a',
        'Renamed',
        'tag-c'
      );
    });
  });

  it('warns when the tag has children', () => {
    renderModal({
      tag: makeTag('tag-a', 'Alpha'),
      existingTags: [
        makeTag('tag-a', 'Alpha'),
        makeTag('tag-b', 'Beta', 'tag-a'),
      ],
    });

    expect(
      screen.getByText(/has child tags/i)
    ).toBeInTheDocument();
  });

  it('calls setTagPublic only when the publicity switch ' +
    'flips', async () => {
      const { onSuccess } = renderModal();

      // Untouched switch → no cascade write.
      submitForm();
      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalled();
      });
      expect(mockApi.setTagPublic).not.toHaveBeenCalled();
    });

  it('routes a publicity flip through setTagPublic — never ' +
    'a raw PATCH flag', async () => {
      renderModal();

      // The Switch's label element also carries the
      // description text — match by substring.
      fireEvent.click(screen.getByLabelText(/Public tag/));
      submitForm();

      await waitFor(() => {
        expect(mockApi.setTagPublic).toHaveBeenCalledWith(
          'tag-a',
          true
        );
      });
      // A publicity-only flip must not fire a no-op
      // name/parent PATCH — setTagPublic alone carries the
      // change (and never receives a `public` PATCH).
      expect(mockApi.updateTag).not.toHaveBeenCalled();
    });

  it('turning a public tag private cascades through ' +
    'setTagPublic', async () => {
      renderModal({
        tag: {
          ...makeTag('tag-a', 'Alpha'),
          public: true,
        },
      });

      // Seeded on — the copy follows the current state.
      expect(screen.getByLabelText(/Public tag/)).toBeChecked();
      expect(
        screen.getByText(/become public/i)
      ).toBeInTheDocument();

      // Flipping off warns that the notes go private too.
      fireEvent.click(screen.getByLabelText(/Public tag/));
      expect(
        screen.getByText(/become private/i)
      ).toBeInTheDocument();
      submitForm();

      await waitFor(() => {
        expect(mockApi.setTagPublic).toHaveBeenCalledWith(
          'tag-a',
          false
        );
      });
    });

  it('shows an error notification and stays open when ' +
    'the update fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(
        () => undefined
      );
      mockApi.updateTag.mockRejectedValue(new Error('boom'));
      const { onClose } = renderModal();

      // updateTag only fires when the details changed.
      fireEvent.change(screen.getByLabelText(/Tag Name/), {
        target: { value: 'Renamed' },
      });
      submitForm();

      await waitFor(() => {
        expect(showNotification).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Error',
            // The thrown error's message reaches the user.
            message: 'boom',
            color: 'red',
          })
        );
      });
      expect(onClose).not.toHaveBeenCalled();
    });

  it('refreshes the list when the publicity cascade fails ' +
    'after a successful rename', async () => {
      vi.spyOn(console, 'error').mockImplementation(
        () => undefined
      );
      mockApi.setTagPublic.mockRejectedValue(
        new Error('Failed to update tag publicity')
      );
      const { onClose, onSuccess } = renderModal();

      // Rename (PATCH succeeds) + publicity flip (fails).
      fireEvent.change(screen.getByLabelText(/Tag Name/), {
        target: { value: 'Renamed' },
      });
      fireEvent.click(screen.getByLabelText(/Public tag/));
      submitForm();

      await waitFor(() => {
        expect(showNotification).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Error',
            message: 'Failed to update tag publicity',
          })
        );
      });
      // Partial success: the rename landed, so the tag list
      // must still refresh — but the modal stays open.
      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

  it('seeds a missing `public` flag as off — no ' +
    'uncontrolled switch', async () => {
      // Pre-upgrade persisted payloads can hydrate a Tag
      // without `public` — the Switch must stay controlled.
      const stale = { ...makeTag('tag-a', 'Alpha') };
      delete (stale as Partial<Tag>).public;
      const { onSuccess } = renderModal({ tag: stale });

      expect(
        screen.getByLabelText(/Public tag/)
      ).not.toBeChecked();

      // Submitting untouched fires neither write — `false`
      // is not a flip from "missing".
      submitForm();
      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalled();
      });
      expect(mockApi.setTagPublic).not.toHaveBeenCalled();
      expect(mockApi.updateTag).not.toHaveBeenCalled();
    });
});
