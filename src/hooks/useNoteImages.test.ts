import { act, renderHook, waitFor } from '@testing-library/react';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import * as api from '../api';
import type { NoteImage } from '../types';
import {
  mutateNoteImages,
  resetNoteImages,
  useNoteImages,
} from './useNoteImages';

vi.mock('../api', () => ({
  fetchNoteImages: vi.fn(),
}));

const makeImage = (id: string): NoteImage => ({
  id,
  storage_url: `gs://bucket/originals/${id}/${id}.png`,
  signed_url: `https://example.com/${id}.png`,
  content_type: 'image/png',
  size_bytes: 1024,
  uploaded_by: 1,
  created_at: '2024-01-01T00:00:00Z',
});

describe('useNoteImages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetNoteImages();
  });

  it('does not fetch while disabled', async () => {
    renderHook(() => useNoteImages('n1', false));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(api.fetchNoteImages).not.toHaveBeenCalled();
  });

  it('fetches once enabled and exposes the images', async () => {
    (api.fetchNoteImages as Mock).mockResolvedValue([
      makeImage('img-1'),
    ]);
    const { result } = renderHook(() =>
      useNoteImages('n1', true)
    );

    expect(result.current.loading).toBe(true);
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.images.map((i) => i.id)).toEqual([
      'img-1',
    ]);
    expect(api.fetchNoteImages).toHaveBeenCalledTimes(1);
  });

  it('dedupes concurrent subscribers into one request',
    async () => {
      (api.fetchNoteImages as Mock).mockResolvedValue([
        makeImage('img-1'),
      ]);
      const first = renderHook(() => useNoteImages('n1', true));
      const second = renderHook(() =>
        useNoteImages('n1', true)
      );

      await waitFor(() => {
        expect(first.result.current.images).toHaveLength(1);
      });
      // One fetch served both hooks (the drag overlay mounts
      // a second card for the same note).
      expect(api.fetchNoteImages).toHaveBeenCalledTimes(1);
      expect(second.result.current.images).toEqual(
        first.result.current.images
      );
    });

  it('reuses the warm entry across a remount', async () => {
    (api.fetchNoteImages as Mock).mockResolvedValue([
      makeImage('img-1'),
    ]);
    const first = renderHook(() => useNoteImages('n1', true));
    await waitFor(() => {
      expect(first.result.current.loading).toBe(false);
    });
    first.unmount();

    const second = renderHook(() => useNoteImages('n1', true));
    // Already loaded — no refetch, images available
    // synchronously.
    expect(second.result.current.images).toHaveLength(1);
    expect(api.fetchNoteImages).toHaveBeenCalledTimes(1);
  });

  it('propagates mutateNoteImages writes to every ' +
    'subscriber', async () => {
      (api.fetchNoteImages as Mock).mockResolvedValue([
        makeImage('img-1'),
      ]);
      const first = renderHook(() => useNoteImages('n1', true));
      const second = renderHook(() =>
        useNoteImages('n1', true)
      );
      await waitFor(() => {
        expect(first.result.current.images).toHaveLength(1);
      });

      act(() => {
        mutateNoteImages('n1', (imgs) => [
          ...imgs,
          makeImage('img-2'),
        ]);
      });

      expect(first.result.current.images.map((i) => i.id))
        .toEqual(['img-1', 'img-2']);
      expect(second.result.current.images).toEqual(
        first.result.current.images
      );

      act(() => {
        mutateNoteImages('n1', (imgs) =>
          imgs.filter((i) => i.id !== 'img-1')
        );
      });
      expect(first.result.current.images.map((i) => i.id))
        .toEqual(['img-2']);
    });

  it('marks a failed fetch as error and retries on a ' +
    'fresh enable', async () => {
      (api.fetchNoteImages as Mock).mockRejectedValueOnce(
        new Error('boom')
      );
      const first = renderHook(() => useNoteImages('n1', true));
      await waitFor(() => {
        expect(first.result.current.error).toBe(true);
      });
      expect(first.result.current.loading).toBe(false);

      // A remount (or re-enable) retries the errored entry.
      (api.fetchNoteImages as Mock).mockResolvedValue([
        makeImage('img-1'),
      ]);
      first.unmount();
      const second = renderHook(() =>
        useNoteImages('n1', true)
      );
      await waitFor(() => {
        expect(second.result.current.images).toHaveLength(1);
      });
      expect(api.fetchNoteImages).toHaveBeenCalledTimes(2);
    });

  it('bounds the onError refresh per image-set signature',
    async () => {
      // The list keeps coming back with the same dead
      // signed_url — the budget caps refetches at 3.
      (api.fetchNoteImages as Mock).mockResolvedValue([
        makeImage('img-1'),
      ]);
      const { result } = renderHook(() =>
        useNoteImages('n1', true)
      );
      await waitFor(() => {
        expect(result.current.images).toHaveLength(1);
      });
      expect(api.fetchNoteImages).toHaveBeenCalledTimes(1);

      for (let i = 0; i < 5; i++) {
        act(() => {
          result.current.refresh();
        });
        await act(async () => {
          await new Promise((r) => setTimeout(r, 0));
        });
      }
      // 1 initial load + 3 bounded refreshes.
      expect(api.fetchNoteImages).toHaveBeenCalledTimes(4);
    });

  it('collapses refresh calls while a fetch is in flight',
    async () => {
      let resolveRefresh: (images: NoteImage[]) => void =
        () => undefined;
      (api.fetchNoteImages as Mock)
        .mockResolvedValueOnce([makeImage('img-1')])
        .mockImplementation(
          () =>
            new Promise((resolve) => {
              resolveRefresh = resolve;
            })
        );
      const { result } = renderHook(() =>
        useNoteImages('n1', true)
      );
      await waitFor(() => {
        expect(result.current.images).toHaveLength(1);
      });

      // N thumbs erroring in one commit join the one
      // in-flight request.
      act(() => {
        result.current.refresh();
        result.current.refresh();
        result.current.refresh();
      });
      expect(api.fetchNoteImages).toHaveBeenCalledTimes(2);

      await act(async () => {
        resolveRefresh([makeImage('img-2')]);
      });
      await waitFor(() => {
        expect(result.current.images.map((i) => i.id))
          .toEqual(['img-2']);
      });
    });
});
