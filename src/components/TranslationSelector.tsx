import { useEffect, useState } from 'react';
import {
  Modal,
  Button,
  Select,
  Radio,
  Group,
  Stack,
  SegmentedControl,
  createStyles,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { loadKjvData, isKjvDataLoaded } from '../utils/kjvDataLoader';
import { useBibleStore } from '../store';
import { getAvailableTranslations } from '../api';


const useStyles = createStyles((theme) => ({
  groupWrapper: {
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.lg,
    border: `1px solid ${
      theme.colorScheme === 'dark' ? theme.colors.dark[4] : theme.colors.gray[3]
    }`,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.md,
  },
}));

const TranslationSelector = () => {
  const { classes } = useStyles();
  const [opened, setOpened] = useState(false);

  const {
    translations,
    setTranslations,
    activeTextFilesetId,
    setActiveTextFilesetId,
    activeAudioFilesetId,
    setActiveAudioFilesetId,
  } = useBibleStore((state) => state);

  // Local state for selections within the modal
  const [selectedTranslationAbbr, setSelectedTranslationAbbr] = useState<string | null>(null);
  const [languageIso, setLanguageIso] = useState('eng');
  const [selectedTextId, setSelectedTextId] = useState<string | null>(activeTextFilesetId);
  const [selectedAudioId, setSelectedAudioId] = useState<string | null>(activeAudioFilesetId);

  const handleAudioChange = (value: string) => {
    setSelectedAudioId(value === 'none' ? null : value);
  };

  const handleTextChange = async (filesetId: string) => {
    // Preload KJV data if selecting KJV translation and it's not already loaded
    if (filesetId === 'ENGKJV' && !isKjvDataLoaded()) {
      notifications.show({
        id: 'kjv-loading',
        loading: true,
        title: 'Loading KJV Bible',
        message: 'Downloading King James Version data (6.8MB)...',
        autoClose: false,
        withCloseButton: false,
      });

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
      }
    }
    setSelectedTextId(filesetId);
  };

  useEffect(() => {
    const fetchTranslations = async () => {
      // Clear previous selections when language changes
      setTranslations([]);
      setSelectedTextId(null);
      setSelectedAudioId(null);

      const fetched = await getAvailableTranslations(languageIso);
      setTranslations(fetched);
    };

    fetchTranslations();
    // We only want this to run when the language changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languageIso]);

  useEffect(() => {
    if (activeTextFilesetId) {
      const currentTranslation = translations.find(t => 
        t.filesets.some(f => f.id === activeTextFilesetId)
      );
      setSelectedTranslationAbbr(currentTranslation?.abbr || null);
      setSelectedTextId(activeTextFilesetId);
      setSelectedAudioId(activeAudioFilesetId);
    }
  }, [opened, translations, activeTextFilesetId, activeAudioFilesetId]);

  const handleSave = () => {
    setActiveTextFilesetId(selectedTextId);
    setActiveAudioFilesetId(selectedAudioId);
    setOpened(false);
  };

  const selectedTranslation = translations.find(
    (t) => t.abbr === selectedTranslationAbbr
  ) || null;

  const textFilesets = selectedTranslation?.filesets.filter(f => f.type === 'text_plain') || [];
  const audioFilesets = selectedTranslation?.filesets.filter(f => f.type.startsWith('audio')) || [];

  return (
    <>
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title="Select Translation"
        size="lg"
      >
        <Stack>
          <SegmentedControl
            data={[
              { label: 'English', value: 'eng' },
              { label: 'Latvian (audio only)', value: 'lvs' },
            ]}
            value={languageIso}
            onChange={setLanguageIso}
            fullWidth
          />
          <Select
            label="Bible Version"
            placeholder="Choose a version"
            data={translations.map((t) => ({ value: t.abbr, label: t.name }))}
            value={selectedTranslationAbbr}
            onChange={setSelectedTranslationAbbr}
            searchable
            dropdownPosition="bottom"
          />

          {selectedTranslation && (
            <>
              {textFilesets.length > 0 && (
                <div className={classes.groupWrapper}>
                  <Radio.Group
                    value={selectedTextId ?? ''}
                    onChange={handleTextChange}
                    label="Text Version"
                  >
                    {textFilesets.map((f) => (
                      <Radio key={f.id} value={f.id} label={f.id} />
                    ))}
                  </Radio.Group>
                </div>
              )}

              {audioFilesets.length > 0 && (
                <div className={classes.groupWrapper}>
                  <Radio.Group
                    value={selectedAudioId ?? 'none'}
                    onChange={handleAudioChange}
                    label="Audio Version"
                  >
                    <Stack spacing="xs">
                      <Radio value="none" label="None" />
                      {audioFilesets.map((f) => (
                        <Radio
                          key={f.id}
                          value={f.id}
                          label={`${f.type === 'audio_drama' ? 'Drama' : 'Audio'} ${f.size} (${f.id})`}
                        />
                      ))}
                    </Stack>
                  </Radio.Group>
                </div>
              )}
            </>
          )}

          <Group position="right" mt="md">
            <Button variant="default" onClick={() => setOpened(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save</Button>
          </Group>
        </Stack>
      </Modal>

      <Button
        variant="subtle"
        onClick={() => setOpened(true)}
        color="gray"
      >
        Translations
      </Button>
    </>
  );
};

export default TranslationSelector;
