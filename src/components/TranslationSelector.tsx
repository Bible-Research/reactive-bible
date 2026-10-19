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
  Group,
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
import { loadKjvData, isKjvDataLoaded } from '../utils/kjvDataLoader';
import { useBibleStore, type Translation } from '../store';
import { shallow } from 'zustand/shallow';
import {
  getAvailableTranslations,
  searchLanguages,
} from '../api';
import { getCachedTranslationIsos } from '../utils/cacheManager';
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

/** Language tabs offered by the selector. */
const LANGUAGES = [
  { label: 'English', value: 'eng' },
  { label: 'Latvian', value: 'lvs' },
  { label: 'Russian', value: 'rus' },
];

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

const CAPABILITY_LABEL: Record<Capability, string> = {
  both: 'Audio',
  text: 'Text only',
  audio: 'Audio only',
};

const AUDIO_KIND_LABEL: Record<OptionKind, string> = {
  audio: 'Read aloud',
  audio_drama: 'Dramatized',
  generated: 'Generated voice',
  text: 'Text',
};

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
  ({ label, capability, ...others }, ref) => (
    <div ref={ref} {...others}>
      <Group position="apart" noWrap>
        <Text size="sm" truncate>
          {label}
        </Text>
        <Badge size="xs" variant="light">
          {CAPABILITY_LABEL[capability]}
        </Badge>
      </Group>
    </div>
  ),
);
VersionItem.displayName = 'VersionItem';

const TranslationSelector = () => {
  const { classes } = useStyles();
  const [opened, setOpened] = useState(false);
  const isMobile = useMediaQuery('(max-width: 768px)');

  const {
    translations,
    setTranslations,
    activeTextFilesetId,
    setActiveTextFilesetId,
    activeAudioFilesetId,
    setActiveAudioFilesetId,
  } = useBibleStore(
    (state) => ({
      translations: state.translations,
      setTranslations: state.setTranslations,
      activeTextFilesetId: state.activeTextFilesetId,
      setActiveTextFilesetId: state.setActiveTextFilesetId,
      activeAudioFilesetId: state.activeAudioFilesetId,
      setActiveAudioFilesetId: state.setActiveAudioFilesetId,
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
  // Iso of the last completed translations fetch — lets the
  // empty state distinguish "fetch finished, genuinely empty"
  // from "still loading" (DBT `bibles` counts are DBT-wide, not
  // scoped to our API key, so a listed language can return no
  // versions).
  const [fetchedIso, setFetchedIso] =
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
    if (grouped.text) {
      void handleTextChange(grouped.text.id);
    } else {
      // Audio-only version: keep the active text when it belongs
      // to a same-language translation; otherwise auto-select a
      // same-language text version (preferring full coverage) so
      // the reader never spins on a stale foreign-language id.
      const owner = findTranslationByFilesetId(
        activeTextFilesetId,
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
          (activeTextFilesetId !== null &&
            ownerText.members.includes(activeTextFilesetId));
        void handleTextChange(
          keepStored ? activeTextFilesetId : ownerText.id,
        );
        setTextNote(`Text: ${owner.name}`);
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
          setTextNote(`Text: ${candidate.name} — auto-selected`);
        } else {
          void handleTextChange(activeTextFilesetId);
          setTextNote(
            'Text: no text version in this language — ' +
              'keeping current',
          );
        }
      }
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

  const openModal = () => {
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
    setOtherIso(null);
    setOtherLanguageName(null);
    setFetchedIso(null);
    pickedLanguageLabelRef.current = null;
    userInteractedRef.current = false;
    // Seed the tab synchronously from the stored selection so
    // a modal last closed on 'other' doesn't flash the empty
    // Other picker before `seedLanguageTab` corrects it — and
    // `languageIso` lands on the right value immediately, so
    // the fetch effect never fires for a stale language. The
    // async effect stays as the fallback for owners missing
    // from the persisted `translations` list.
    const owner =
      findTranslationByFilesetId(
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
    setOpened(true);
  };

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
        title: 'Loading KJV Bible',
        message: 'Downloading King James Version data...',
        autoClose: false,
        withCloseButton: false,
      });

      setTextResolving(true);
      try {
        await loadKjvData();
        notifications.update({
          id: 'kjv-loading',
          color: 'green',
          title: 'KJV Bible Loaded',
          message: 'King James Version is ready to use.',
          loading: false,
          autoClose: 3000,
        });
      } catch (error) {
        notifications.update({
          id: 'kjv-loading',
          color: 'red',
          title: 'Failed to Load KJV Bible',
          message: 'Please check your connection and try again.',
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

      // Show cached list immediately for snappy UX (stale)…
      try {
        const cached = await getAvailableTranslations(iso);
        if (!cancelled) {
          merge(cached);
          setFetchedIso(iso);
        }
      } catch (error) {
        console.warn('Failed to load translations:', error);
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
        // A stale failure (modal closed or language switched
        // mid-flight) must not toast over the new context.
        if (!cancelled) {
          notifications.show({
            title: 'Translations unavailable',
            message:
              'Could not refresh the translation list. ' +
              'Please try again later.',
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
      const persistedOwner =
        findTranslationByFilesetId(audioId, persisted) ??
        findTranslationByFilesetId(textId, persisted);
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
              return [] as Translation[];
            });
          if (cancelled || userInteractedRef.current) return null;
          const hit = findTranslationByFilesetId(filesetId, list);
          if (hit) return hit;
        }
        return null;
      };
      const owner =
        (await findOwner(audioId)) ?? (await findOwner(textId));
      if (!cancelled && !userInteractedRef.current && owner) {
        seedLanguage(owner.language_iso, owner.language);
      }
    };
    void seedLanguageTab();
    return () => {
      cancelled = true;
    };
  }, [opened]);

  useEffect(() => {
    // Clear transient selections whenever the language changes.
    setSelectedTranslationAbbr(null);
    setSelectedTextId(null);
    setSelectedAudioId(null);
    setTextNote(null);
  }, [languageIso]);

  useEffect(() => {
    if (tab !== 'other') return;
    const query = debouncedLanguageQuery.trim();
    if (query === pickedLanguageLabelRef.current) {
      // Consume the post-pick echo once — leaving the ref set
      // would silently skip a later real search that happens
      // to retype the same label.
      pickedLanguageLabelRef.current = null;
      return;
    }
    if (query.length < 2) {
      setLanguageOptions([]);
      return;
    }
    // A real user query — the pinned echo label is stale now.
    pickedLanguageLabelRef.current = null;
    let cancelled = false;
    void searchLanguages(query, 1, LANGUAGE_SEARCH_LIMIT).then(
      (results) => {
        if (cancelled) return;
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
      },
    );
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
    const owner =
      findTranslationByFilesetId(
        activeAudioFilesetId,
        inLanguage,
      ) ??
      findTranslationByFilesetId(
        activeTextFilesetId,
        inLanguage,
      );
    if (owner) applyVersionSelection(owner.abbr, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, translations, selectedTranslationAbbr]);

  const handleAudioChange = (value: string) => {
    setSelectedAudioId(value === 'none' ? null : value);
  };

  const handleSave = () => {
    // Never write `null` over a valid stored selection — a null
    // text id leaves the reader blank. `null` audio is the
    // legitimate "None" choice, so it is stored verbatim.
    setActiveTextFilesetId(selectedTextId ?? activeTextFilesetId);
    setActiveAudioFilesetId(selectedAudioId);
    setOpened(false);
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
    ...LANGUAGES,
    {
      label: otherLanguageName
        ? `Other: ${otherLanguageName}`
        : 'Other',
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
        onClose={() => setOpened(false)}
        title="Select Translation"
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
              label="Language"
              placeholder="Search languages…"
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
                  ? 'Type at least 2 characters'
                  : 'No languages found'
              }
              searchable
              dropdownPosition="bottom"
            />
          )}
          <Select
            label="Version"
            placeholder={
              languageIso
                ? 'Choose a version'
                : 'Pick a language first'
            }
            data={versionData}
            itemComponent={VersionItem}
            value={selectedTranslationAbbr}
            onChange={(abbr) => {
              userInteractedRef.current = true;
              applyVersionSelection(abbr);
            }}
            disabled={!languageIso}
            searchable
            dropdownPosition="bottom"
          />
          {languageIso !== null &&
            fetchedIso === languageIso &&
            versionData.length === 0 && (
              <Text size="sm" color="dimmed">
                No versions available for this language
              </Text>
            )}

          {selectedTranslation && (
            <>
              <div className={classes.groupWrapper}>
                <Text size="sm" weight={500} mb={4}>
                  Text
                </Text>
                {grouped.text ? (
                  <Text size="xs" color="dimmed">
                    Auto-resolved per testament:{' '}
                    {testamentSummary(grouped.text)}
                  </Text>
                ) : (
                  <Text size="xs" color="dimmed" italic>
                    {textNote ?? 'No text version available'}
                  </Text>
                )}
              </div>

              {grouped.audio.length > 0 && (
                <div className={classes.groupWrapper}>
                  <Radio.Group
                    value={audioGroupValue}
                    onChange={handleAudioChange}
                    label="Audio"
                  >
                    <Stack spacing="xs" mt="xs">
                      <Radio value="none" label="None" />
                      {grouped.audio.map((option) => (
                        <Radio
                          key={option.id}
                          value={option.id}
                          label={
                            `${AUDIO_KIND_LABEL[option.kind]} — ` +
                            `${option.coverageLabel}`
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
                      Advanced — raw filesets
                    </Accordion.Control>
                    <Accordion.Panel>
                      <Stack spacing="md">
                        {rawTextFilesets.length > 0 && (
                          <Radio.Group
                            value={rawTextValue}
                            onChange={(id) =>
                              void handleTextChange(id)
                            }
                            label="Text filesets"
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
                        {rawAudioFilesets.length > 0 && (
                          <Radio.Group
                            value={rawAudioValue}
                            onChange={setSelectedAudioId}
                            label="Audio filesets"
                          >
                            <Stack spacing="xs" mt="xs">
                              {rawAudioFilesets.map((f) => (
                                <Radio
                                  key={f.id}
                                  value={f.id}
                                  label={
                                    `${
                                      f.type === 'audio_drama'
                                        ? 'Drama'
                                        : 'Audio'
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
            <Button variant="default" onClick={() => setOpened(false)}>
              Cancel
            </Button>
            {/* Disabled until a version resolves — saving with
                none selected would wipe the stored ids — and
                while a text selection is still resolving (KJV
                chunk download), which would persist `null`. */}
            <Button
              onClick={handleSave}
              disabled={!selectedTranslationAbbr || textResolving}
            >
              Save
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Button
        variant="subtle"
        onClick={openModal}
        color="gray"
      >
        Change Translation
      </Button>
    </>
  );
};

export default TranslationSelector;
