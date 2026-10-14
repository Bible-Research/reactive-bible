import { useEffect, useState } from 'react';
import { getVersesInChapter } from '../api';
import { groupRefsByChapter } from '../utils/verseRefs';
import { toBookName } from '../utils/bibleUtils';
import { resolveTextFileset } from '../utils/filesetGroups';
import type { Translation } from '../store';
import type { VerseRef } from '../types';

export interface VerseText {
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

/**
 * Fetches display text for the given refs, grouped by book/chapter
 * (selections may span chapters or books). Best-effort: failures
 * are swallowed and the previous result is replaced by whatever
 * could be loaded. Returns [] while disabled or without refs.
 */
export const useVerseTexts = (
  refs: VerseRef[],
  filesetId: string | null,
  translations: Translation[],
  enabled = true,
): VerseText[] => {
  const [verseTexts, setVerseTexts] = useState<VerseText[]>([]);

  useEffect(() => {
    if (!enabled || !filesetId || refs.length === 0) {
      setVerseTexts([]);
      return;
    }

    let cancelled = false;

    const fetchVerseTexts = async () => {
      try {
        const groups = groupRefsByChapter(refs);
        const results = await Promise.all(
          groups.map(async (group) => {
            // The stored id may be a product/group id — resolve
            // per book so `_ET` testament splits (and the ENGKJV
            // offline fast-path) work.
            const resolvedId =
              resolveTextFileset(
                filesetId,
                group.bookId,
                translations,
              ) ?? filesetId;
            const result = await getVersesInChapter(
              group.bookId,
              group.chapter,
              resolvedId
            );
            const wanted = new Set(group.verses);
            return result.verses
              .filter((v) => wanted.has(v.verse))
              .map((v) => ({
                book: toBookName(group.bookId) ?? group.bookId,
                chapter: group.chapter,
                verse: v.verse,
                text: v.text,
              }));
          })
        );
        if (!cancelled) setVerseTexts(results.flat());
      } catch {
        // Non-critical — verse preview is best-effort
      }
    };

    void fetchVerseTexts();

    return () => {
      cancelled = true;
    };
  }, [refs, filesetId, translations, enabled]);

  return verseTexts;
};

/**
 * Groups verse texts by "Book N" label, preserving the order in
 * which each group first appears.
 */
export const groupVerseTexts = (
  verseTexts: VerseText[],
): [string, VerseText[]][] => {
  const groups = new Map<string, VerseText[]>();
  for (const v of verseTexts) {
    const key = `${v.book} ${v.chapter}`;
    const group = groups.get(key);
    if (group) {
      group.push(v);
    } else {
      groups.set(key, [v]);
    }
  }
  return [...groups.entries()];
};
