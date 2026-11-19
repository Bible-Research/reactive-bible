import {
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from 'react';
import { useDebouncedValue, useMediaQuery } from '@mantine/hooks';
import {
  Accordion,
  Badge,
  Button,
  Center,
  Group,
  Loader,
  Modal,
  Radio,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Text,
  createStyles,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { loadKjvData, isKjvDataLoaded } from '../utils/kjvDataLoader';
import { useBibleStore, type Translation } from '../store';
import { shallow } from 'zustand/shallow';
import {
  getAvailableTranslations,
  searchLanguages,
} from '../api';
import { getCachedTranslationIsos } from '../utils/cacheManager';
import { captureHandledError } from '../utils/errorReporter';
import {
  findAudioOption,
  findTranslationByFilesetId,
  groupFilesets,
  type FilesetOption,
  type OptionKind,
} from '../utils/filesetGroups';


const useStyles = createStyles((theme) => ({
  groupWrapper: {
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.lg,
    border: `1px solid ${
      theme.colorScheme === 'dark'
        ? theme.colors.dark[4]
        : theme.colors.gray[3]
    }`,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.md,
  },
}));

/**
 * Language tabs offered by the selector. `labelKey` resolves
 * through the UI catalog at render time.
 */
const LANGUAGES = [
  { labelKey: 'translations.langEnglish', value: 'eng' },
  { labelKey: 'translations.langLatvian', value: 'lvs' },
  { labelKey: 'translations.langRussian', value: 'rus' },
] as const;

/** Tab ids: the fixed languages plus the "Other" picker. */
type LanguageTab = 'eng' | 'lvs' | 'rus' | 'other';

/**
 * Page size requested from the DBT language search — DBT
 * clamps to ~150/page, so one broad query reaches nearly
 * every match instead of being stuck on page 1's 25 rows.
 */
const LANGUAGE_SEARCH_LIMIT = 150;

/** One row in the Other-tab language Select. */
type LanguageOption = {
  value: string;
  label: string;
  /**
   * The untruncated DBT `name` — the display label embeds
   * `" — "` separators too, so re-splitting it would
   * truncate names that contain one themselves.
   */
  name: string | null;
};

type Capability = 'both' | 'text' | 'audio';

const CAPABILITY_LABEL_KEY = {
  both: 'translations.capabilityBoth',
  text: 'translations.capabilityText',
  audio: 'translations.capabilityAudio',
} as const;

const AUDIO_KIND_LABEL_KEY = {
  audio: 'translations.kindReadAloud',
  audio_drama: 'translations.kindDramatized',
  generated: 'translations.kindGenerated',
  text: 'translations.kindText',
} as const satisfies Record<OptionKind, string>;

/** Capability chip shown next to each version in the picker. */
const capabilityOf = (translation: Translation): Capability => {
  const { text, audio } = groupFilesets(translation);
  if (text && audio.length > 0) return 'both';
  if (text) return 'text';
  return 'audio';
};

/** Resolved member ids per testament, e.g. "OT: X · NT: Y". */
const testamentSummary = (option: FilesetOption): string =>
  (['OT', 'NT'] as const)
    .filter((testament) => option.byTestament[testament])
    .map((testament) => {
      const ids = [
        ...new Set(Object.values(option.byTestament[testament] ?? {})),
      ];
      return `${testament}: ${ids.join(', ')}`;
    })
    .join(' · ');

/**
 * Fallback text translation for audio-only versions: same
 * language, preferring complete (Full Bible) coverage.
 */
const pickTextTranslation = (
  translations: Translation[],
  languageIso: string,
): Translation | null => {
  const withText = translations.filter(
    (t) => t.language_iso === languageIso && groupFilesets(t).text,
  );
  const complete = withText.find((t) => {
    const text = groupFilesets(t).text;
    return (
      text !== null &&
      Boolean(text.byTestament.OT) &&
      Boolean(text.byTestament.NT) &&
      !text.partial.OT &&
      !text.partial.NT
    );
  });
  return complete ?? withText[0] ?? null;
};

interface VersionItemProps extends ComponentPropsWithoutRef<'div'> {
  label: string;
  capability: Capability;
}

const VersionItem = forwardRef<HTMLDivElement, VersionItemProps>(
  ({ label, capability, ...others }, ref) => {
    const { t } = useTranslation();
    return (
      <div ref={ref} {...others}>
        <Group position="apart" align="flex-start" noWrap>
          <Text size="sm" style={{ flex: 1, minWidth: 0 }}>
            {label}
          </Text>
          <Badge
            size="xs"
            variant="light"
            style={{ flexShrink: 0 }}
          >
            {t(CAPABILITY_LABEL_KEY[capability])}
          </Badge>
        </Group>
      </div>
    );
  },
);
VersionItem.displayName = 'VersionItem';

interface TranslationSelectorProps {
  /**
   * Controlled open state — pass with `onClose` to drive the
   * modal from a host that renders no trigger button (the
   * /settings pin picker). Leave undefined for the header
   * usage, which keeps its own "Change Translation" button.
   */
  opened?: boolean;
  /** Fires when the modal wants to close in controlled mode. */
  onClose?: () => void;
  /**
   * Pick-only mode: hides BOTH audio surfaces (the radio
   * group and the Advanced raw-fileset radios) and makes Save
   * report the chosen text fileset via `onPickText` instead
   * of writing `activeTextFilesetId`/`activeAudioFilesetId`.
   */
  pickTextOnly?: boolean;
  /**
   * Pick-mode seed — the current pin. Every site that reads
   * the active filesets swaps to it so a text-only pin is
   * never seeded from the reader's audio owner.
   */
  seedFilesetId?: string | null;
  /** Pick-mode Save callback — gets the chosen text id. */
  onPickText?: (filesetId: string | null) => void;
}

const TranslationSelector = ({
  opened: controlledOpened,
  onClose,
  pickTextOnly = false,
  seedFilesetId = null,
  onPickText,
}: TranslationSelectorProps = {}) => {
  const { t } = useTranslation();
  const { classes } = useStyles();
  const [internalOpened, setInternalOpened] = useState(false);
  const isControlled = controlledOpened !== undefined;
  const opened = isControlled ? controlledOpened : internalOpened;
  const closeModal = () => {
    setInternalOpened(false);
    onClose?.();
  };
  const isMobile = useMediaQuery('(max-width: 768px)');

  const {
    translations,
    setTranslations,
    activeTextFilesetId,
    setActiveTextFilesetId,
    activeAudioFilesetId,
    setActiveAudioFilesetId,
    lastSelectionByLanguage,
    setLastSelectionByLanguage,
  } = useBibleStore(
    (state) => ({
      translations: state.translations,
      setTranslations: state.setTranslations,
      activeTextFilesetId: state.activeTextFilesetId,
      setActiveTextFilesetId: state.setActiveTextFilesetId,
      activeAudioFilesetId: state.activeAudioFilesetId,
      setActiveAudioFilesetId: state.setActiveAudioFilesetId,
      lastSelectionByLanguage: state.lastSelectionByLanguage,
      setLastSelectionByLanguage:
        state.setLastSelectionByLanguage,
    }),
    shallow
  );

  // Local state for selections within the modal
  const [selectedTranslationAbbr, setSelectedTranslationAbbr] =
    useState<string | null>(null);
  // Language tab plus the Other-tab pick: `otherIso` is the
  // DBT iso the user chose in the language search Select and
  // `otherLanguageName` its display name (tab relabel).
  const [tab, setTab] = useState<LanguageTab>('eng');
  const [otherIso, setOtherIso] = useState<string | null>(null);
  const [otherLanguageName, setOtherLanguageName] =
    useState<string | null>(null);
  const [languageQuery, setLanguageQuery] = useState('');
  const [languageOptions, setLanguageOptions] = useState<
    LanguageOption[]
  >([]);
  // True while a `searchLanguages` request is in flight —
  // the picker shows a loader instead of flashing "No
  // languages found" before the first results arrive.
  const [searchingLanguages, setSearchingLanguages] =
    useState(false);
  // Iso of the last completed translations fetch — lets the
  // empty state distinguish "fetch finished, genuinely empty"
  // from "still loading" (DBT `bibles` counts are DBT-wide, not
  // scoped to our API key, so a listed language can return no
  // versions).
  const [fetchedIso, setFetchedIso] =
    useState<string | null>(null);
  // Iso whose translations fetch failed outright — releases the
  // Version select from the loading state into a failure note
  // instead of spinning forever.
  const [failedIso, setFailedIso] =
    useState<string | null>(null);
  // Effective iso driving the fetch effect and the versionData
  // filter: the picked language on Other, else the tab itself.
  // `null` while Other has no language picked — no fetch then.
  const languageIso: string | null =
    tab === 'other' ? otherIso : tab;
  const [selectedTextId, setSelectedTextId] =
    useState<string | null>(null);
  const [selectedAudioId, setSelectedAudioId] =
    useState<string | null>(null);
  // Info line for text that does not belong to the selected
  // version (audio-only versions borrow a same-language text).
  const [textNote, setTextNote] = useState<string | null>(null);
  // True while a text selection is resolving asynchronously
  // (e.g. the lazy KJV chunk download). Saving in that window
  // would persist a `null` text selection and blank the reader.
  const [textResolving, setTextResolving] = useState(false);
  // Tracks manual interaction so async language seeding never
  // stomps a pick the user just made.
  const userInteractedRef = useRef(false);
  // Languages in which the user touched the version picker
  // this session. The restore effect can't reuse
  // `userInteractedRef` — switching tabs (the very gesture
  // that triggers a restore) sets it — so it guards on this
  // per-language record instead: once the user picks a
  // version while viewing a language, the remembered entry
  // for that language stops applying.
  const versionPickedIsosRef = useRef(new Set<string>());

  // Debounced Other-tab language search — DBT's `language_name`
  // is a substring match, so ≥2 chars is enough to be useful.
  const [debouncedLanguageQuery] =
    useDebouncedValue(languageQuery, 300);
  // Label of the picked language — Mantine refills the search
  // input with it after a selection; the search effect skips
  // that echo so it doesn't fire a redundant request.
  const pickedLanguageLabelRef = useRef<string | null>(null);

  /**
   * Selects a version and derives the text/audio selections:
   * text resolves to the version's grouped text product (or a
   * same-language fallback for audio-only versions); audio keeps
   * the active product when this version owns it, otherwise
   * prefers the first audio option over None. `restoreStored`
   * (seeding the modal with the current selection) restores a
   * stored `null` audio verbatim so a saved "None" survives a
   * no-op reopen.
   */
  const applyVersionSelection = (
    abbr: string | null,
    restoreStored = false,
  ) => {
    setSelectedTranslationAbbr(abbr);
    setTextNote(null);
    const translation = translations.find((t) => t.abbr === abbr);
    if (!translation) {
      setSelectedTextId(null);
      setSelectedAudioId(null);
      return;
    }
    const grouped = groupFilesets(translation);
    // A text-less version falls back on this seed id: the
    // reader's text selection normally, the pin in pick mode —
    // a pin must not silently inherit the reader's translation.
    const textSeedId = pickTextOnly
      ? seedFilesetId ?? activeTextFilesetId
      : activeTextFilesetId;
    if (grouped.text) {
      void handleTextChange(grouped.text.id);
    } else {
      // Audio-only version: keep the active text when it belongs
      // to a same-language translation; otherwise auto-select a
      // same-language text version (preferring full coverage) so
      // the reader never spins on a stale foreign-language id.
      const owner = findTranslationByFilesetId(
        textSeedId,
        translations,
      );
      if (
        owner &&
        owner.language_iso === translation.language_iso
      ) {
        // Keep concrete member ids verbatim; a product id is
        // normalized to the owner's current text product so a
        // drifted id isn't re-persisted on save.
        const ownerText = groupFilesets(owner).text;
        const keepStored =
          !ownerText ||
          (textSeedId !== null &&
            ownerText.members.includes(textSeedId));
        void handleTextChange(
          keepStored ? textSeedId : ownerText.id,
        );
        setTextNote(
          t('translations.textNote', { name: owner.name }),
        );
      } else {
        const candidate = pickTextTranslation(
          translations,
          translation.language_iso,
        );
        const candidateText = candidate
          ? groupFilesets(candidate).text
          : null;
        if (candidate && candidateText) {
          void handleTextChange(candidateText.id);
          setTextNote(
            t('translations.textAutoSelected', {
              name: candidate.name,
            }),
          );
        } else {
          void handleTextChange(textSeedId);
          setTextNote(t('translations.noTextInLanguage'));
        }
      }
    }
    if (pickTextOnly) {
      // Pick mode is text-only — no audio is ever staged, so
      // the restore/auto-pick below stays inert.
      setSelectedAudioId(null);
      return;
    }
    // Normalize a stored member id (or a drifted product id via
    // the `{abbr}:{kind}` prefix fallback) to the product id —
    // new selections store the product id.
    const audioOwner = findAudioOption(
      activeAudioFilesetId,
      translations,
    );
    const audioOption =
      audioOwner &&
      audioOwner.translation.abbr === translation.abbr
        ? audioOwner.option
        : undefined;
    if (audioOption) {
      setSelectedAudioId(audioOption.id);
    } else if (restoreStored && activeAudioFilesetId === null) {
      // Seeding the current selection: keep a saved "None".
      setSelectedAudioId(null);
    } else {
      // Prefer the first real audio option over None.
      setSelectedAudioId(grouped.audio[0]?.id ?? null);
    }
  };

  /**
   * Lands the picker on a language: a fixed-tab iso selects
   * its tab; anything else goes to Other with the pick
   * restored (`name` falls back to the iso itself). The ref
   * pin suppresses the label the Select echoes back into the
   * search input.
   */
  const seedLanguage = (iso: string, name: string | null) => {
    if (LANGUAGES.some((l) => l.value === iso)) {
      setTab(iso as LanguageTab);
      return;
    }
    const label = name || iso;
    setTab('other');
    setOtherIso(iso);
    setOtherLanguageName(label);
    pickedLanguageLabelRef.current = label;
  };

  /**
   * Wipes the picker's transient selections/Other-tab state
   * so a (re)open starts clean — shared by the trigger's
   * `openModal` and the `[opened]` effect so a controlled
   * open resets exactly like an uncontrolled one.
   */
  const resetPickerState = () => {
    setSelectedTranslationAbbr(null);
    setSelectedTextId(null);
    setSelectedAudioId(null);
    setTextNote(null);
    // Reset the Other-tab picker so a stale search echo (the
    // previous pick's full "name — autonym" label) can't fire
    // a spurious request on reopen — `seedLanguageTab`
    // re-derives the pick from the active store selection.
    setLanguageQuery('');
    setLanguageOptions([]);
    setSearchingLanguages(false);
    setOtherIso(null);
    setOtherLanguageName(null);
    setFetchedIso(null);
    setFailedIso(null);
    pickedLanguageLabelRef.current = null;
    userInteractedRef.current = false;
    versionPickedIsosRef.current.clear();
  };

  /**
   * Seeds the language tab from the stored selection — the
   * pin (`seedFilesetId`) in pick mode, else the audio-then-
   * text owner. A text-only pin must never seed from the
   * reader's AUDIO owner: pin=NIV with audio=ESV would land
   * on 'eng' while the pin lives in another language.
   */
  const seedTabFromSelection = () => {
    const owner = pickTextOnly
      ? findTranslationByFilesetId(
          seedFilesetId ?? activeTextFilesetId,
          translations,
        )
      : findTranslationByFilesetId(
          activeAudioFilesetId,
          translations,
        ) ??
        findTranslationByFilesetId(
          activeTextFilesetId,
          translations,
        );
    if (owner) {
      seedLanguage(owner.language_iso, owner.language);
    } else {
      setTab('eng');
    }
  };

  const openModal = () => {
    resetPickerState();
    // Seed the tab synchronously from the stored selection so
    // a modal last closed on 'other' doesn't flash the empty
    // Other picker before `seedLanguageTab` corrects it — and
    // `languageIso` lands on the right value immediately, so
    // the fetch effect never fires for a stale language. The
    // async effect stays as the fallback for owners missing
    // from the persisted `translations` list.
    seedTabFromSelection();
    setInternalOpened(true);
  };

  // A controlled open gets the same clean slate + seed as the
  // trigger path — reopening on the same language must not
  // show stale selections. Idempotent on uncontrolled opens
  // (openModal already ran both helpers in the same commit).
  useEffect(() => {
    if (!opened) return;
    resetPickerState();
    seedTabFromSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  const handleTextChange = async (filesetId: string | null) => {
    if (filesetId === null) {
      setSelectedTextId(null);
      return;
    }
    // Preload KJV data when selecting the KJV text fileset (raw
    // id or `{abbr}:text:{n}` product id) and it is not already
    // loaded.
    if (
      (filesetId === 'ENGKJV' || filesetId.startsWith('ENGKJV:')) &&
      !isKjvDataLoaded()
    ) {
      notifications.show({
        id: 'kjv-loading',
        loading: true,
        title: t('translations.kjvLoading'),
        message: t('translations.kjvDownloading'),
        autoClose: false,
        withCloseButton: false,
      });

      setTextResolving(true);
      try {
        await loadKjvData();
        notifications.update({
          id: 'kjv-loading',
          color: 'green',
          title: t('translations.kjvLoaded'),
          message: t('translations.kjvReady'),
          loading: false,
          autoClose: 3000,
        });
      } catch (error) {
        notifications.update({
          id: 'kjv-loading',
          color: 'red',
          title: t('translations.kjvFailed'),
          message: t('translations.kjvFailedMsg'),
          loading: false,
          autoClose: 5000,
        });
        return; // Prevent switching to KJV if the data fails to load
      } finally {
        setTextResolving(false);
      }
    }
    setSelectedTextId(filesetId);
  };

  useEffect(() => {
    // No language picked on the Other tab yet — nothing to
    // fetch until `otherIso` lands.
    if (!languageIso) return;
    const iso = languageIso;
    let cancelled = false;
    // A new attempt for this language clears any earlier
    // failure — the loader shows again until it settles.
    setFailedIso(null);

    const fetchTranslations = async () => {
      // Merge by abbr instead of replacing: the store's
      // `translations` may hold other languages that the active
      // selection depends on (resolveTextFileset/AudioFileset
      // look up product ids there); overwriting it with a single
      // language's list would strand stored `{abbr}:{kind}:{n}`
      // ids so they pass through unresolved.
      const merge = (incoming: Translation[]) => {
        const current =
          useBibleStore.getState().translations;
        const byAbbr = new Map(
          current.map((t) => [t.abbr, t])
        );
        for (const t of incoming) byAbbr.set(t.abbr, t);
        setTranslations([...byAbbr.values()]);
      };

      let succeeded = false;

      // Show cached list immediately for snappy UX (stale)…
      try {
        const cached = await getAvailableTranslations(iso);
        if (!cancelled) {
          merge(cached);
          setFetchedIso(iso);
          succeeded = true;
        }
      } catch (error) {
        console.warn('Failed to load translations:', error);
        captureHandledError(error, 'Translations fetch', {
          languageIso: iso,
          source: 'cache',
        });
        // Modal closed — no revalidation follows, so this
        // failure is terminal and must release the loader.
        if (!cancelled && !opened) setFailedIso(iso);
      }

      // …then revalidate against the API so newly published
      // translations show up without requiring a cache bust.
      if (!opened) return;
      try {
        const fresh = await getAvailableTranslations(iso, true);
        if (!cancelled) {
          merge(fresh);
          setFetchedIso(iso);
        }
      } catch (error) {
        console.warn('Failed to refresh translations:', error);
        captureHandledError(error, 'Translations fetch', {
          languageIso: iso,
          source: 'revalidate',
        });
        // A stale failure (modal closed or language switched
        // mid-flight) must not toast over the new context.
        if (!cancelled) {
          // Nothing was ever loaded for this language — without
          // this the Version select would spin forever now that
          // the toast has auto-closed.
          if (!succeeded) setFailedIso(iso);
          notifications.show({
            title: t('translations.unavailable'),
            message: t('translations.refreshFailed'),
            color: 'red',
            autoClose: 5000,
          });
        }
      }
    };

    // A failed fetch must not surface as an unhandled
    // rejection (global errorReporter toast) — the stale store
    // list stays usable.
    fetchTranslations().catch((error) => {
      console.error('Error loading translations:', error);
      captureHandledError(error, 'Translations fetch', {
        languageIso,
      });
    });

    return () => {
      cancelled = true;
    };
    // We refetch whenever the modal is (re)opened or the language changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languageIso, opened]);

  useEffect(() => {
    if (!opened) return;
    let cancelled = false;
    // Seed the language tab from the active selection — without
    // it a foreign-language (e.g. Latvian) selection would show
    // the English tab and a no-op Save would wipe the stored
    // ids. The store's `translations` list is merged across all
    // fetched languages, so the owner is usually already
    // persisted — resolve its language with no extra request,
    // preferring the audio owner (that's the version the user
    // picked when text is borrowed from another version). The
    // per-tab fetch loop stays as a fallback for the rare case
    // the owner isn't persisted yet.
    const seedLanguageTab = async () => {
      const {
        activeAudioFilesetId: audioId,
        activeTextFilesetId: textId,
        translations: persisted,
      } = useBibleStore.getState();
      // Pick mode skips the audio-owner preference entirely —
      // a text-only pin seeds from the pin (else the reader's
      // text fileset), never the audio owner.
      const primaryId = pickTextOnly
        ? seedFilesetId ?? textId
        : audioId;
      const secondaryId = pickTextOnly ? null : textId;
      const persistedOwner =
        findTranslationByFilesetId(primaryId, persisted) ??
        findTranslationByFilesetId(secondaryId, persisted);
      if (persistedOwner) {
        if (!cancelled && !userInteractedRef.current) {
          // Fixed-tab isos select their tab; anything else
          // reopens on Other with the pick restored from the
          // owner's `language`/`language_iso` fields.
          seedLanguage(
            persistedOwner.language_iso,
            persistedOwner.language,
          );
        }
        return;
      }
      // Not persisted — scan every language with a cached
      // list (the fixed tabs plus any Other-language cache
      // entries) so a stored selection in a non-listed
      // language still lands on its own tab/Other pick
      // instead of a mismatched default.
      const findOwner = async (
        filesetId: string | null,
      ): Promise<Translation | null> => {
        if (!filesetId) return null;
        const isos = new Set([
          ...LANGUAGES.map((l) => l.value),
          ...getCachedTranslationIsos(),
        ]);
        for (const iso of isos) {
          // One failed language response must not strand the
          // seeding — a failed fetch counts as "not this
          // language", keep scanning the other tabs.
          const list = await getAvailableTranslations(iso)
            .catch((error) => {
              console.warn(
                `Failed to load ${iso} translations:`, error
              );
              captureHandledError(
                error,
                'Translations fetch',
                { languageIso: iso, source: 'seed-scan' }
              );
              return [] as Translation[];
            });
          if (cancelled || userInteractedRef.current) return null;
          const hit = findTranslationByFilesetId(filesetId, list);
          if (hit) return hit;
        }
        return null;
      };
      const owner =
        (await findOwner(primaryId)) ??
        (await findOwner(secondaryId));
      if (!cancelled && !userInteractedRef.current && owner) {
        seedLanguage(owner.language_iso, owner.language);
      }
    };
    void seedLanguageTab();
    return () => {
      cancelled = true;
    };
    // Seeding runs on open only — a mid-session prop change
    // must not re-seed over the user's picks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  useEffect(() => {
    // Clear transient selections whenever the language changes.
    setSelectedTranslationAbbr(null);
    setSelectedTextId(null);
    setSelectedAudioId(null);
    setTextNote(null);
  }, [languageIso]);

  useEffect(() => {
    if (tab !== 'other') {
      // The Other tab is not visible — a stale in-flight flag
      // must not linger for the next visit.
      setSearchingLanguages(false);
      return;
    }
    const query = debouncedLanguageQuery.trim();
    if (query === pickedLanguageLabelRef.current) {
      // Consume the post-pick echo once — leaving the ref set
      // would silently skip a later real search that happens
      // to retype the same label.
      pickedLanguageLabelRef.current = null;
      setSearchingLanguages(false);
      return;
    }
    if (query.length < 2) {
      setLanguageOptions([]);
      setSearchingLanguages(false);
      return;
    }
    // A real user query — the pinned echo label is stale now.
    pickedLanguageLabelRef.current = null;
    let cancelled = false;
    setSearchingLanguages(true);
    void searchLanguages(query, 1, LANGUAGE_SEARCH_LIMIT)
      .then((results) => {
        if (cancelled) return;
        setSearchingLanguages(false);
        setLanguageOptions(
          results
            // Backend rows can carry null fields — a `null`
            // iso is not a valid Mantine Select value and a
            // `null` name would render "null — null".
            .filter((r) => r.iso && r.name)
            .map((r) => ({
              value: r.iso,
              label: r.autonym
                ? `${r.name} — ${r.autonym}`
                : r.name,
              name: r.name,
            })),
        );
      })
      // A failed search must not surface as an unhandled
      // rejection (global errorReporter toast) — warn and
      // land on an empty option list instead.
      .catch((error) => {
        if (cancelled) return;
        console.warn('Failed to search languages:', error);
        captureHandledError(error, 'Language search');
        setSearchingLanguages(false);
        setLanguageOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedLanguageQuery, tab]);

  useEffect(() => {
    if (!opened) return;
    // The fresh translation list can drop the chosen version
    // (e.g. after a language switch) — clear it so the effect can
    // re-derive from the active filesets.
    if (
      selectedTranslationAbbr !== null &&
      !translations.some((t) => t.abbr === selectedTranslationAbbr)
    ) {
      setSelectedTranslationAbbr(null);
      setSelectedTextId(null);
      setSelectedAudioId(null);
      setTextNote(null);
      return;
    }
    // Until the user picks a version, mirror the currently active
    // filesets (translations may arrive after the modal opens).
    if (selectedTranslationAbbr !== null) return;
    // Other tab with no language picked yet: skip the mirror —
    // seeding the store's active selection here would render
    // the Text/Audio panels and enable Save beneath the
    // disabled "Pick a language first" Version select.
    if (languageIso === null) return;
    // The audio owner wins when it differs: for an audio-only
    // version with a borrowed same-language text, the audio owner
    // is the version the user actually picked — otherwise reopen
    // would show the borrowed text version and a Save would drop
    // the audio selection. Scope the lookup to the viewed
    // language: the merged `translations` store keeps rows from
    // other languages, so an unscoped lookup would mirror a
    // stored eng selection onto e.g. the Spanish tab — enabling
    // Save and rendering the panels under the wrong language.
    const inLanguage = translations.filter(
      (t) => t.language_iso === languageIso,
    );
    // Pick mode mirrors the pin seed only — the reader's audio
    // owner is irrelevant to a text-only pick.
    const owner = pickTextOnly
      ? findTranslationByFilesetId(
          seedFilesetId ?? activeTextFilesetId,
          inLanguage,
        )
      : findTranslationByFilesetId(
          activeAudioFilesetId,
          inLanguage,
        ) ??
        findTranslationByFilesetId(
          activeTextFilesetId,
          inLanguage,
        );
    if (owner) {
      applyVersionSelection(owner.abbr, true);
      return;
    }
    // No active owner in this language — fall back to the
    // remembered per-language pick, staged verbatim (the
    // resolve-on-save paths normalize the ids). Only a `abbr`
    // still present in this language's fetched list is
    // staged; a stale entry keeps the no-memory behavior.
    // Guarded by the per-language pick record so a fresh
    // user pick wins.
    const remembered = lastSelectionByLanguage[languageIso];
    if (
      !remembered ||
      versionPickedIsosRef.current.has(languageIso)
    ) {
      return;
    }
    const rememberedTranslation = inLanguage.find(
      (tr) => tr.abbr === remembered.abbr,
    );
    if (!rememberedTranslation) return;
    setSelectedTranslationAbbr(remembered.abbr);
    setSelectedTextId(remembered.textId);
    setSelectedAudioId(remembered.audioId);
    // A remembered audio-only version may carry a borrowed
    // same-language text — surface its owner like a fresh
    // pick does.
    const rememberedTextOwner = remembered.textId
      ? findTranslationByFilesetId(
          remembered.textId,
          translations,
        )
      : null;
    setTextNote(
      rememberedTextOwner &&
        rememberedTextOwner.abbr !== remembered.abbr
        ? t('translations.textNote', {
            name: rememberedTextOwner.name,
          })
        : null,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    opened,
    languageIso,
    translations,
    selectedTranslationAbbr,
    lastSelectionByLanguage,
  ]);

  const handleAudioChange = (value: string) => {
    setSelectedAudioId(value === 'none' ? null : value);
  };

  const handleSave = () => {
    if (pickTextOnly) {
      // Pick mode reports the text id — the reader's active
      // filesets and per-language memory are untouched.
      onPickText?.(selectedTextId);
      closeModal();
      return;
    }
    // Never write `null` over a valid stored selection — a null
    // text id leaves the reader blank. `null` audio is the
    // legitimate "None" choice, so it is stored verbatim.
    const savedTextId = selectedTextId ?? activeTextFilesetId;
    setActiveTextFilesetId(savedTextId);
    setActiveAudioFilesetId(selectedAudioId);
    // Remember the saved pick under its language so a later
    // visit to that language tab re-stages it. Recording the
    // exact ids Save wrote keeps an explicit audio "None"
    // (`null`) intact. Cancel skips this — browsing must not
    // touch the record.
    if (selectedTranslation) {
      setLastSelectionByLanguage(
        selectedTranslation.language_iso,
        {
          abbr: selectedTranslation.abbr,
          textId: savedTextId,
          audioId: selectedAudioId,
        },
      );
    }
    closeModal();
  };

  const selectedTranslation =
    translations.find((t) => t.abbr === selectedTranslationAbbr) ||
    null;

  const grouped = selectedTranslation
    ? groupFilesets(selectedTranslation)
    : { text: null, audio: [] };

  // The product radio stays selected when the stored value is a
  // raw member id (chosen in Advanced or persisted legacy id) or
  // a drifted `{abbr}:{kind}:{n}` product id — the resolver's
  // prefix fallback maps it to the current option id instead of
  // displaying a stale id as "None" while re-persisting it.
  const audioGroupValue = (() => {
    if (!selectedAudioId) return 'none';
    const found = findAudioOption(selectedAudioId, translations);
    return found?.translation.abbr === selectedTranslationAbbr
      ? found.option.id
      : 'none';
  })();

  const versionData = useMemo(
    () =>
      translations
        // The store's list may hold several languages (merged
        // per-language fetches) — the dropdown only offers the
        // selected language's versions.
        .filter((t) => t.language_iso === languageIso)
        .map((t) => ({
          value: t.abbr,
          label: `${t.name} (${t.abbr})`,
          capability: capabilityOf(t),
        })),
    [translations, languageIso],
  );

  // Async retrieval still in flight — the pickers show a
  // loader instead of flashing the empty/no-results message.
  // `languageQuery !== debouncedLanguageQuery` counts too: the
  // search only fires after the 300 ms debounce, so the gap
  // would otherwise flash "No languages found" mid-type.
  const languageSearchPending =
    languageQuery.trim().length >= 2 &&
    languageQuery.trim() !== pickedLanguageLabelRef.current &&
    (searchingLanguages ||
      languageQuery.trim() !== debouncedLanguageQuery.trim());
  const versionsLoading =
    languageIso !== null &&
    fetchedIso !== languageIso &&
    failedIso !== languageIso;

  // Shared dropdown body for the in-flight state — a spinner
  // plus dimmed label where the pickers would otherwise show
  // their empty/no-results text.
  const dropdownLoading = (
    <Center>
      <Group spacing="xs" noWrap>
        <Loader size="sm" />
        <Text size="sm" color="dimmed">
          {t('translations.loading')}
        </Text>
      </Group>
    </Center>
  );

  // Language Select options: the latest search results, with
  // the picked iso pinned in so its label always renders even
  // after the result list is replaced by a new search.
  const languageSelectData = useMemo(() => {
    if (!otherIso) return languageOptions;
    const picked = languageOptions.find(
      (o) => o.value === otherIso,
    ) ?? {
      value: otherIso,
      label: otherLanguageName ?? otherIso,
      name: otherLanguageName,
    };
    return [
      picked,
      ...languageOptions.filter((o) => o.value !== otherIso),
    ];
  }, [languageOptions, otherIso, otherLanguageName]);

  const languageTabs = [
    ...LANGUAGES.map((l) => ({
      label: t(l.labelKey),
      value: l.value,
    })),
    {
      label: otherLanguageName
        ? t('translations.otherNamed', {
            name: otherLanguageName,
          })
        : t('translations.other'),
      value: 'other',
    },
  ];

  // Raw fileset radios (Advanced/debug). opus16 variants are
  // hidden: opus16 is the default codec and mp3 the automatic
  // fallback, so codec selection is never exposed.
  const rawFilesets = (selectedTranslation?.filesets ?? []).filter(
    (f) => !f.id.endsWith('-opus16'),
  );
  const rawTextFilesets = rawFilesets.filter(
    (f) => f.type === 'text_plain',
  );
  const rawAudioFilesets = rawFilesets.filter((f) =>
    f.type.startsWith('audio'),
  );
  const rawTextValue = rawTextFilesets.some(
    (f) => f.id === selectedTextId,
  )
    ? selectedTextId ?? ''
    : '';
  const rawAudioValue = rawAudioFilesets.some(
    (f) => f.id === selectedAudioId,
  )
    ? selectedAudioId ?? ''
    : '';

  return (
    <>
      <Modal
        opened={opened}
        onClose={closeModal}
        title={t('translations.select')}
        size="lg"
        fullScreen={isMobile}
      >
        <Stack>
          {/* ScrollArea: four tabs overflow on narrow (mobile)
              screens — min-width on the root lets the bar scroll
              horizontally; a no-op on desktop where it fits. */}
          <ScrollArea>
            <SegmentedControl
              data={languageTabs}
              value={tab}
              onChange={(value) => {
                userInteractedRef.current = true;
                setTab(value as LanguageTab);
              }}
              styles={{
                root: { minWidth: 'max-content', width: '100%' },
                label: { whiteSpace: 'nowrap' },
              }}
              fullWidth
            />
          </ScrollArea>
          {tab === 'other' && (
            <Select
              label={t('translations.language')}
              placeholder={t('translations.searchLanguages')}
              data={languageSelectData}
              value={otherIso}
              onChange={(iso) => {
                userInteractedRef.current = true;
                const picked = languageSelectData.find(
                  (o) => o.value === iso,
                );
                pickedLanguageLabelRef.current =
                  picked?.label ?? null;
                setOtherIso(iso);
                // The option carries the raw DBT `name` —
                // re-splitting the "name — autonym" label
                // would truncate names containing " — ".
                setOtherLanguageName(
                  picked?.name ?? picked?.label ?? null,
                );
              }}
              searchValue={languageQuery}
              onSearchChange={setLanguageQuery}
              nothingFound={
                languageQuery.trim().length < 2
                  ? t('translations.typeMinChars')
                  : languageSearchPending
                    ? dropdownLoading
                    : t('translations.noLanguages')
              }
              rightSection={
                languageSearchPending ? (
                  <Loader size="xs" />
                ) : undefined
              }
              searchable
              dropdownPosition="bottom"
            />
          )}
          <Select
            label={t('translations.version')}
            placeholder={
              languageIso
                ? t('translations.chooseVersion')
                : t('translations.pickLanguageFirst')
            }
            data={versionData}
            itemComponent={VersionItem}
            value={selectedTranslationAbbr}
            onChange={(abbr) => {
              userInteractedRef.current = true;
              if (languageIso !== null) {
                versionPickedIsosRef.current.add(languageIso);
              }
              applyVersionSelection(abbr);
            }}
            rightSection={
              versionsLoading ? <Loader size="xs" /> : undefined
            }
            nothingFound={
              versionsLoading ? dropdownLoading : undefined
            }
            disabled={!languageIso}
            searchable
            dropdownPosition="bottom"
          />
          {languageIso !== null &&
            fetchedIso === languageIso &&
            versionData.length === 0 && (
              <Text size="sm" color="dimmed">
                {t('translations.noVersions')}
              </Text>
            )}
          {languageIso !== null &&
            failedIso === languageIso && (
              <Text size="sm" color="dimmed">
                {t('translations.loadVersionsFailed')}
              </Text>
            )}

          {selectedTranslation && (
            <>
              <div className={classes.groupWrapper}>
                <Text size="sm" weight={500} mb={4}>
                  {t('translations.text')}
                </Text>
                {grouped.text ? (
                  <Text size="xs" color="dimmed">
                    {t('translations.autoResolved', {
                      summary: testamentSummary(grouped.text),
                    })}
                  </Text>
                ) : (
                  <Text size="xs" color="dimmed" italic>
                    {textNote ?? t('translations.noTextAvailable')}
                  </Text>
                )}
              </div>

              {!pickTextOnly && grouped.audio.length > 0 && (
                <div className={classes.groupWrapper}>
                  <Radio.Group
                    value={audioGroupValue}
                    onChange={handleAudioChange}
                    label={t('translations.audio')}
                  >
                    <Stack spacing="xs" mt="xs">
                      <Radio
                        value="none"
                        label={t('translations.none')}
                      />
                      {grouped.audio.map((option) => (
                        <Radio
                          key={option.id}
                          value={option.id}
                          label={
                            `${t(AUDIO_KIND_LABEL_KEY[option.kind])}` +
                            ` — ${option.coverageLabel}`
                          }
                        />
                      ))}
                    </Stack>
                  </Radio.Group>
                </div>
              )}

              {rawFilesets.length > 0 && (
                <Accordion variant="contained">
                  <Accordion.Item value="advanced">
                    <Accordion.Control>
                      {t('translations.advanced')}
                    </Accordion.Control>
                    <Accordion.Panel>
                      <Stack spacing="md">
                        {rawTextFilesets.length > 0 && (
                          <Radio.Group
                            value={rawTextValue}
                            onChange={(id) =>
                              void handleTextChange(id)
                            }
                            label={t('translations.textFilesets')}
                          >
                            <Stack spacing="xs" mt="xs">
                              {rawTextFilesets.map((f) => (
                                <Radio
                                  key={f.id}
                                  value={f.id}
                                  label={f.id}
                                />
                              ))}
                            </Stack>
                          </Radio.Group>
                        )}
                        {!pickTextOnly &&
                          rawAudioFilesets.length > 0 && (
                          <Radio.Group
                            value={rawAudioValue}
                            onChange={setSelectedAudioId}
                            label={t('translations.audioFilesets')}
                          >
                            <Stack spacing="xs" mt="xs">
                              {rawAudioFilesets.map((f) => (
                                <Radio
                                  key={f.id}
                                  value={f.id}
                                  label={
                                    `${
                                      f.type === 'audio_drama'
                                        ? t('translations.drama')
                                        : t('translations.audio')
                                    } ${f.size} (${f.id})`
                                  }
                                />
                              ))}
                            </Stack>
                          </Radio.Group>
                        )}
                      </Stack>
                    </Accordion.Panel>
                  </Accordion.Item>
                </Accordion>
              )}
            </>
          )}

          <Group position="right" mt="md">
            <Button variant="default" onClick={closeModal}>
              {t('common.cancel')}
            </Button>
            {/* Disabled until a version resolves — saving with
                none selected would wipe the stored ids — and
                while a text selection is still resolving (KJV
                chunk download), which would persist `null`. */}
            <Button
              onClick={handleSave}
              disabled={!selectedTranslationAbbr || textResolving}
            >
              {t('common.save')}
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Controlled mode (the settings pick flow) renders no
          trigger — the host owns `opened`. */}
      {!isControlled && (
        <Button
          variant="subtle"
          onClick={openModal}
          color="gray"
        >
          {t('translations.change')}
        </Button>
      )}
    </>
  );
};

export default TranslationSelector;
