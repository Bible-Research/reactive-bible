import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import PassageView from '../components/PassageView';
import { useBibleStore } from '../store';

/**
 * Regression coverage for issue #110: when the user jumps between
 * chapters faster than the API responds, the last resolved
 * response must not overwrite the currently selected chapter.
 * Jumping ch1 -> ch4 -> ch3 used to render chapter 4 content once
 * its (slower) request resolved last.
 */

type ChapterResult = {
  verses: { verse: number; text: string }[];
  headings: never[];
};

const deferred = vi.hoisted(() => ({
  resolvers: new Map<string, (r: ChapterResult) => void>(),
}));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    getVersesInChapter: vi.fn(
      (bookId: string, chapter: number) =>
        new Promise<ChapterResult>((resolve) => {
          deferred.resolvers.set(`${bookId}.${chapter}`, resolve);
        })
    ),
    prefetchAudioUrl: vi.fn(),
    prefetchAdjacentChapters: vi.fn(),
  };
});

const chapterText = (bookId: string, chapter: number): string =>
  `CH-${bookId}-${chapter}-MARKER`;

const resolveChapter = (bookId: string, chapter: number) =>
  deferred.resolvers.get(`${bookId}.${chapter}`)?.({
    verses: [{ verse: 1, text: chapterText(bookId, chapter) }],
    headings: [],
  });

describe('Stale chapter responses are discarded (#110)', () => {
  beforeEach(() => {
    deferred.resolvers.clear();
    useBibleStore.setState({
      activeBookId: 'JHN',
      activeChapter: 1,
      verseSelection: null,
      bibleVersion: 'ESV',
      activeTextFilesetId: 'ENGESV_API',
      activeAudioFilesetId: null,
      audioPlaylistItems: null,
      showAudioPlayer: false,
    });
  });

  it('ignores a slower response for a chapter the user left',
    async () => {
      render(
        <MemoryRouter initialEntries={['/bible/JHN.1']}>
          <PassageView />
        </MemoryRouter>
      );

      // Initial chapter resolves normally.
      await act(async () => {
        resolveChapter('JHN', 1);
      });
      await waitFor(() => {
        expect(
          screen.getByText(chapterText('JHN', 1))
        ).toBeInTheDocument();
      });

      // Jump forward to ch4, then back to ch3 before either
      // request resolves.
      act(() => {
        useBibleStore
          .getState()
          .setActiveBookAndChapter('JHN', 4);
      });
      act(() => {
        useBibleStore
          .getState()
          .setActiveBookAndChapter('JHN', 3);
      });

      // The ch3 response arrives first.
      await act(async () => {
        resolveChapter('JHN', 3);
      });
      await waitFor(() => {
        expect(
          screen.getByText(chapterText('JHN', 3))
        ).toBeInTheDocument();
      });

      // The stale ch4 response resolves last — it must be
      // discarded, not rendered over the active chapter 3.
      await act(async () => {
        resolveChapter('JHN', 4);
      });
      await waitFor(() => {
        expect(
          screen.getByText(chapterText('JHN', 3))
        ).toBeInTheDocument();
      });
      expect(
        screen.queryByText(chapterText('JHN', 4))
      ).not.toBeInTheDocument();
    }
  );
});
