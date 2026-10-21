import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  toUsfmCode,
  buildBiblePath,
  decodeVerses,
  getChapterCount,
  getMaxVerse,
} from '../utils/bibleUtils';

/**
 * Redirects legacy name-based URLs (/bible/John/3,
 * /bible/1%20Corinthians/1.5) to the canonical dot-notation
 * route (/bible/JHN.3, /bible/1CO.1.5). Unresolvable input
 * falls back to /bible.
 */
export default function LegacyBibleRedirect() {
  const { book, chapterVerse } = useParams<{
    book?: string;
    chapterVerse?: string;
  }>();
  const navigate = useNavigate();

  useEffect(() => {
    const bookId = book ? toUsfmCode(book) : null;
    if (!bookId || !chapterVerse) {
      void navigate('/bible', { replace: true });
      return;
    }

    const dotIdx = chapterVerse.indexOf('.');
    const chapterStr =
      dotIdx >= 0 ? chapterVerse.slice(0, dotIdx) : chapterVerse;
    const verseStr =
      dotIdx >= 0 ? chapterVerse.slice(dotIdx + 1) : '';
    const chapter = parseInt(chapterStr, 10);
    // Out-of-range chapters (e.g. /bible/Malachi/5) fall back to
    // /bible rather than routing to a blank page.
    if (
      !/^\d+$/.test(chapterStr) ||
      chapter < 1 ||
      chapter > getChapterCount(bookId)
    ) {
      void navigate('/bible', { replace: true });
      return;
    }

    const verses = verseStr
      ? decodeVerses(verseStr, getMaxVerse(bookId, chapter))
      : undefined;
    if (verseStr && (!verses || verses.length === 0)) {
      void navigate('/bible', { replace: true });
      return;
    }
    void navigate(buildBiblePath(bookId, chapter, verses), {
      replace: true,
    });
  }, [book, chapterVerse, navigate]);

  return null;
}
