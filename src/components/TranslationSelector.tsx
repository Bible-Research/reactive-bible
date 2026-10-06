import {
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from 'react';
import { useMediaQuery } from '@mantine/hooks';
import {
  Accordion,
  Badge,
  Button,
  Group,
  Modal,
  Radio,
  SegmentedControl,
  Select,
  Stack,
  Text,
  createStyles,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { loadKjvData, isKjvDataLoaded } from '../utils/kjvDataLoader';
import { useBibleStore, type Translation } from '../store';
import { getAvailableTranslations } from '../api';
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
];

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
  } = useBibleStore((state) => state);

  // Local state for selections within the modal
  const [selectedTranslationAbbr, setSelectedTranslationAbbr] =
    useState<string | null>(null);
  const [languageIso, setLanguageIso] = useState('eng');
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

  /**
   * Selects a version and derives the text/audio selections:
   * text resolves to the version's grouped text product (or a
   * same-language fallback for audio-only versions); audio keeps
   * the active product when this version owns it, defaults to the
   * first option for audio-only versions, else None.
   */
  const applyVersionSelection = (abbr: string | null) => {
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
    } else if (!grouped.text && grouped.audio.length > 0) {
      // Audio-only versions default to their primary audio.
      setSelectedAudioId(grouped.audio[0].id);
    } else {
      setSelectedAudioId(null);
    }
  };

  const openModal = () => {
    setSelectedTranslationAbbr(null);
    setSelectedTextId(null);
    setSelectedAudioId(null);
    setTextNote(null);
    userInteractedRef.current = false;
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
      const cached = await getAvailableTranslations(languageIso);
      if (!cancelled) {
        merge(cached);
      }

      // …then revalidate against the API so newly published
      // translations show up without requiring a cache bust.
      if (!opened) return;
      const fresh = await getAvailableTranslations(languageIso, true);
      if (!cancelled) {
        merge(fresh);
      }
    };

    fetchTranslations();

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
    // ids. The store's `translations` only ever holds the
    // current tab's list, so look the owner up across every tab,
    // preferring the audio owner (that's the version the user
    // picked when text is borrowed from another version).
    const seedLanguageTab = async () => {
      const {
        activeAudioFilesetId: audioId,
        activeTextFilesetId: textId,
      } = useBibleStore.getState();
      const findOwnerIso = async (
        filesetId: string | null,
      ): Promise<string | null> => {
        if (!filesetId) return null;
        for (const { value: iso } of LANGUAGES) {
          const list = await getAvailableTranslations(iso);
          if (cancelled || userInteractedRef.current) return null;
          if (findTranslationByFilesetId(filesetId, list)) {
            return iso;
          }
        }
        return null;
      };
      const iso =
        (await findOwnerIso(audioId)) ?? (await findOwnerIso(textId));
      if (!cancelled && !userInteractedRef.current && iso) {
        setLanguageIso(iso);
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
    // The audio owner wins when it differs: for an audio-only
    // version with a borrowed same-language text, the audio owner
    // is the version the user actually picked — otherwise reopen
    // would show the borrowed text version and a Save would drop
    // the audio selection.
    const owner =
      findTranslationByFilesetId(
        activeAudioFilesetId,
        translations,
      ) ??
      findTranslationByFilesetId(
        activeTextFilesetId,
        translations,
      );
    if (owner) applyVersionSelection(owner.abbr);
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
          <SegmentedControl
            data={LANGUAGES}
            value={languageIso}
            onChange={(iso) => {
              userInteractedRef.current = true;
              setLanguageIso(iso);
            }}
            fullWidth
          />
          <Select
            label="Version"
            placeholder="Choose a version"
            data={versionData}
            itemComponent={VersionItem}
            value={selectedTranslationAbbr}
            onChange={(abbr) => {
              userInteractedRef.current = true;
              applyVersionSelection(abbr);
            }}
            searchable
            dropdownPosition="bottom"
          />

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
