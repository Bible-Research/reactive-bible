/**
 * Per-card note-translation state (NoteCard language UX).
 *
 * The note list may already arrive with `?lang=` applied —
 * `note.served_language` reports what `note.note_text`
 * actually contains and `note.translations` carries the
 * per-language metadata. This hook adds per-card language
 * switching on top: a `?lang=` refetch fills a session cache
 * keyed by note id + updated_at so flipping between languages
 * never refetches, a failed refetch keeps the last-good text
 * (never silently substituting the original), and a `pending`
 * row schedules exactly one delayed refetch before giving up.
 *
 * Disabled entirely when the persisted `autoTranslateNotes`
 * toggle is off — the card then renders `note.note_text`
 * untouched and no `?lang=` request is ever issued.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { showNotification } from '@mantine/notifications';
import i18n from '../i18n';
import { getNote, retranslateNote,
  setNoteTranslationVerified } from '../api';
import { useBibleStore } from '../store';
import { captureHandledError } from '../utils/errorReporter';
import type { Note, NoteTranslationMeta } from '../types';

/** note id + updated_at + lang → payload cached for the
 *  session. `updated_at` in the key makes an edited note's
 *  stale translated text unreachable. */
const textCache = new Map<string, Note>();
const cacheKey = (noteId: string, updatedAt: string, lang: string) =>
  `${noteId}:${updatedAt}:${lang}`;

/** One delayed refetch window after a pending row is seen. */
const PENDING_REFETCH_MS = 4000;

export interface NoteLanguageState {
  /** False hides every translation control and fetch. */
  enabled: boolean;
  /** Languages the switcher offers (source + ready + pref). */
  languages: string[];
  /** Language currently selected in the switcher. */
  selectedLang: string | null;
  /** Language of `displayText` (== selected except peek). */
  servedLang: string | null;
  /** The text the card should render right now. */
  displayText: string;
  /** True while a `?lang=` refetch is in flight. */
  switching: boolean;
  /** Peeking at the original without changing selection. */
  peekingOriginal: boolean;
  setPeekingOriginal: (peek: boolean) => void;
  selectLanguage: (lang: string) => void;
  /** Transient 'translating…' / 'failed' / 'verified' meta. */
  translations: NoteTranslationMeta[];
  /** Owner verify/unverify of `selectedLang` (ready rows). */
  verifySelected: (verified: boolean) => void;
  /** Owner re-enqueue of failed rows. */
  retryFailed: () => void;
  acting: boolean;
}

export const useNoteTranslation = (
  note: Note
): NoteLanguageState => {
  const autoTranslate = useBibleStore(
    (s) => s.autoTranslateNotes
  );
  const preferred = useBibleStore(
    (s) => s.preferredNoteLanguage
  );
  const uiLanguage = useBibleStore((s) => s.uiLanguage);
  const setPreferred = useBibleStore(
    (s) => s.setPreferredNoteLanguage
  );

  const source = note.source_language ?? null;
  const served = note.served_language ?? source;
  const meta = note.translations ?? [];

  // Languages to offer: detected source + every ready/pending
  // target + the preferred language (so its pending row shows
  // 'translating…' instead of hiding the option).
  const languages = [
    ...new Set(
      [
        source,
        ...meta.map((t) => t.language),
      ].filter((l): l is string => Boolean(l))
    ),
  ];

  const enabled =
    autoTranslate && !!source && languages.length > 1;

  const initial = preferred ?? uiLanguage;
  const [selectedLang, setSelectedLang] = useState<string>(
    () =>
      enabled && initial !== source && languages.includes(initial)
        ? initial
        : (served ?? source ?? 'en')
  );
  const [display, setDisplay] = useState<{
    text: string;
    lang: string | null;
    meta: NoteTranslationMeta[];
  }>({
    text: note.note_text,
    lang: served,
    meta,
  });
  const [peekingOriginal, setPeekingOriginal] =
    useState(false);
  const [switching, setSwitching] = useState(false);
  const [acting, setActing] = useState(false);
  const pendingRetried = useRef(false);

  // Keep displayed state in sync when the parent hands a
  // fresh payload for the SAME language (list refetch).
  useEffect(() => {
    setDisplay((prev) =>
      prev.lang === (note.served_language ?? source)
        ? {
            text: note.note_text,
            lang: note.served_language ?? source,
            meta: note.translations ?? [],
          }
        : prev
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.note_text, note.served_language]);

  const applyPayload = useCallback(
    (payload: Note, lang: string) => {
      textCache.set(
        cacheKey(note.id, payload.updated_at, lang),
        payload
      );
      setDisplay({
        text: payload.note_text,
        lang: payload.served_language ?? lang,
        meta: payload.translations ?? [],
      });
    },
    [note.id]
  );

  const selectLanguage = useCallback(
    (lang: string) => {
      setSelectedLang(lang);
      setPeekingOriginal(false);
      if (!enabled) return;
      // Persisted preference only follows explicit picks —
      // the 'source' tab never rewrites it.
      if (lang !== source) setPreferred(lang);

      const cached = textCache.get(
        cacheKey(note.id, note.updated_at, lang)
      );
      if (cached) {
        applyPayload(cached, lang);
        return;
      }
      // lang == source serves the original server-side too —
      // but the payload text IS the original only when this
      // note arrived without ?lang=; refetch to be exact.
      if (lang === source && served === source) {
        applyPayload(note, lang);
        return;
      }
      setSwitching(true);
      getNote(note.id, lang)
        .then((payload) => applyPayload(payload, lang))
        .catch((err) => {
          // Keep the last-good text (6.5) — never swap in the
          // original silently; a retry is one click away.
          captureHandledError(err, 'note-translation');
          showNotification({
            title: i18n.t('common.error'),
            message: i18n.t(
              'notes.translation.loadFailed'
            ),
            color: 'red',
          });
          setSelectedLang(display.lang ?? lang);
        })
        .finally(() => setSwitching(false));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, note, served, source, display.lang]
  );

  // One delayed refetch after a pending row appears (6.6):
  // a fresh note/edit's pending rows resolve in seconds, and
  // stopping after ready/failed avoids a polling loop.
  const hasPending = display.meta.some(
    (t) => t.status === 'pending'
  );
  useEffect(() => {
    if (!enabled || !hasPending || pendingRetried.current) {
      return;
    }
    pendingRetried.current = true;
    const timer = setTimeout(() => {
      getNote(note.id, display.lang ?? undefined)
        .then((payload) =>
          applyPayload(payload, display.lang ?? source ?? 'en')
        )
        .catch(() => undefined);
    }, PENDING_REFETCH_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, hasPending]);

  const verifySelected = useCallback(
    (verified: boolean) => {
      if (!selectedLang || acting) return;
      setActing(true);
      setNoteTranslationVerified(note.id, selectedLang, verified)
        .then(() => {
          setDisplay((prev) => ({
            ...prev,
            meta: prev.meta.map((t) =>
              t.language === selectedLang
                ? { ...t, verified }
                : t
            ),
          }));
        })
        .catch((err) =>
          captureHandledError(err, 'note-verify')
        )
        .finally(() => setActing(false));
    },
    [note.id, selectedLang, acting]
  );

  const retryFailed = useCallback(() => {
    if (acting) return;
    setActing(true);
    retranslateNote(note.id)
      .then(() => {
        setDisplay((prev) => ({
          ...prev,
          meta: prev.meta.map((t) =>
            t.status === 'failed'
              ? { ...t, status: 'pending' as const }
              : t
          ),
        }));
        pendingRetried.current = false;
      })
      .catch((err) =>
        captureHandledError(err, 'note-retranslate')
      )
      .finally(() => setActing(false));
  }, [note.id, acting]);

  // The 'Show original' peek needs the source text locally —
  // serve it from the payload when the card IS the original,
  // else from the cache (a prior source-languages fetch), else
  // fetch it once through the same path (still no selection
  // or preference change).
  const shownText = peekingOriginal
    ? textCache.get(
        cacheKey(note.id, note.updated_at, source ?? '')
      )?.note_text ??
      (served === source ? note.note_text : display.text)
    : display.text;

  return {
    enabled,
    languages,
    selectedLang,
    servedLang: peekingOriginal ? source : display.lang,
    displayText: shownText,
    switching,
    peekingOriginal,
    setPeekingOriginal,
    selectLanguage,
    translations: display.meta,
    verifySelected,
    retryFailed,
    acting,
  };
};
