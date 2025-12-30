import { useEffect, useState } from 'react';
import {
  Modal,
  Button,
  Select,
  Radio,
  Group,
  Stack,
  createStyles,
} from '@mantine/core';
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
  const [selectedTextId, setSelectedTextId] = useState<string | null>(activeTextFilesetId);
  const [selectedAudioId, setSelectedAudioId] = useState<string | null>(activeAudioFilesetId);

  const handleAudioChange = (value: string) => {
    setSelectedAudioId(value === 'none' ? null : value);
  };

  useEffect(() => {
    const fetchTranslations = async () => {
      if (translations.length === 0) {
        const fetched = await getAvailableTranslations('eng');
        setTranslations(fetched);
      }
    };
    fetchTranslations();
  }, [translations, setTranslations]);

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
        title="Select Bible Translation"
        size="lg"
      >
        <Stack>
          <Select
            label="Bible Version"
            placeholder="Choose a version"
            value={selectedTranslationAbbr ?? ''}
            onChange={setSelectedTranslationAbbr}
            data={translations.map((t) => ({ value: t.abbr, label: t.name }))}
          />

          {selectedTranslation && (
            <>
              {textFilesets.length > 0 && (
                <div className={classes.groupWrapper}>
                  <Radio.Group
                    value={selectedTextId ?? ''}
                    onChange={setSelectedTextId}
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
                          label={`${f.type === 'audio_drama' ? 'Drama' : 'Audio'} (testament: ${f.size})`}
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

      <Button onClick={() => setOpened(true)}>Translations</Button>
    </>
  );
};

export default TranslationSelector;
