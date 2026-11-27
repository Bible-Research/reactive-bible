/**
 * Per-card note-translation state (NoteCard language UX).
 *
 * The note list may already arrive with `?lang=` applied —
 * `note.served_language` reports what `note.note_text`
 * actually contains and `note.translations` carries the
 * per-language metadata. This hook adds per-card language
 * switching on top: a `?lang=` refetch fills a session cache
 * keyed by note id + updated_at so flipping between languages
 * never refetches, and a failed refetch keeps the last-good
 * text (never silently substituting the original).
 *
 * The backend translation pipeline is disabled — no new
 * `pending`/`ready`/`failed` rows are produced. Legacy
 * `pending`/`failed` rows can never resolve, so the switcher
 * offers only languages the server can actually return: the
 * detected source plus rows already `ready`.
 *
 * Disabled entirely when the persisted `autoTranslateNotes`
 * toggle is off — the card then renders `note.note_text`
 * untouched and no `?lang=` request is ever issued.
 */
import { useCallback, useEffect, useState } from 'react';
import { showNotification } from '@mantine/notifications';
import i18n from '../i18n';
import { getNote,
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

export interface NoteLanguageState {
  /** False hides every translation control and fetch. */
  enabled: boolean;
  /** Languages the switcher offers (source + ready rows). */
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
  /** Per-language meta (drives the verified chip/verify). */
  translations: NoteTranslationMeta[];
  /** Owner verify/unverify of `selectedLang` (ready rows). */
  verifySelected: (verified: boolean) => void;
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

  // Languages to offer: detected source + rows the server
  // can serve right now ('ready' + the 'source' anchor row).
  // The translation pipeline is off, so pending/failed rows
  // are dead ends — listing them would only offer languages
  // that can never be fetched.
  const languages = [
    ...new Set(
      [
        source,
        ...meta
          .filter(
            (t) =>
              t.status === 'ready' || t.status === 'source'
          )
          .map((t) => t.language),
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
    acting,
  };
};
