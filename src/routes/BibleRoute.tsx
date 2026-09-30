import { useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useBibleStore } from '../store';
import { useAuthStore } from '../stores/authStore';
import { parseBibleRef } from '../utils/bibleUtils';
import { sameRefSet } from '../utils/verseRefs';
import type { VerseRef } from '../types';
import Passage from '../components/Passage';

export default function BibleRoute() {
  const { ref } = useParams<{ ref?: string }>();
  const parsed = useMemo(
    () => (ref ? parseBibleRef(ref) : null),
    [ref],
  );

  const navigate = useNavigate();
  const {
    activeBookId,
    activeChapter,
    setActiveBookAndChapter,
    setVerseSelection,
    setShowNotes,
    setVersesFolded,
    getTags,
  } = useBibleStore();
  const isAuthenticated = useAuthStore(
    (state) => state.isAuthenticated,
  );

  // Always refresh tags when navigating to this route
  useEffect(() => {
    if (isAuthenticated) {
      getTags(true); // Force refresh to get latest tags
    }
  }, [getTags, isAuthenticated]);

  // Sync book/chapter URL params to store and handle redirects:
  // - bare /bible -> /bible/{activeBookId}.{activeChapter}
  // - unparseable ref -> /bible
  // - non-canonical ref (lowercase code, missing chapter,
  //   book name) -> canonical form
  // activeBookId/activeChapter are intentionally included so this
  // re-runs after Zustand persist rehydration overwrites the state.
  useEffect(() => {
    setShowNotes(false);
    setVersesFolded(false);

    if (ref === undefined) {
      navigate(`/bible/${activeBookId}.${activeChapter}`, {
        replace: true,
      });
      return;
    }
    if (!parsed) {
      navigate('/bible', { replace: true });
      return;
    }
    if (parsed.needsRedirect) {
      navigate(`/bible/${parsed.canonical}`, { replace: true });
      return;
    }
    if (
      parsed.bookId !== activeBookId ||
      parsed.chapter !== activeChapter
    ) {
      setActiveBookAndChapter(parsed.bookId, parsed.chapter);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, parsed, activeBookId, activeChapter]);

  // Sync verse URL param to store. Guarded so that navigating from
  // Verse.tsx (which already updated verseSelection) does not
  // re-set the store when the URL already matches selection.
  useEffect(() => {
    if (parsed && parsed.verses.length > 0) {
      const refs: VerseRef[] = parsed.verses.map((v) => ({
        bookId: parsed.bookId,
        chapter: parsed.chapter,
        verse: v,
      }));
      const current = useBibleStore.getState().verseSelection;
      const matches =
        current?.scope === 'bible' &&
        sameRefSet(current.refs, refs);
      if (!matches) {
        setVerseSelection({ scope: 'bible', refs });
      }
      return;
    }
    if (useBibleStore.getState().verseSelection !== null) {
      setVerseSelection(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed]);

  return <Passage />;
}
