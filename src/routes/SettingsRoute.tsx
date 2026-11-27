import { useState } from 'react';
import {
  Box,
  Button,
  Divider,
  Group,
  Radio,
  Stack,
  Switch,
  Text,
  Title,
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useBibleStore } from '../store';
import { findTranslationByFilesetId } from '../utils/filesetGroups';
import TranslationSelector from '../components/TranslationSelector';

/**
 * /settings — device-local preferences (persisted in the
 * bible-storage blob, no account needed). The note-reference
 * translation pin controls which translation the '@…'
 * scripture previews and note-linked verse text render in;
 * its picker reuses TranslationSelector's pick-only mode so
 * choosing it never retunes the reader. A second switch asks
 * for confirmation before a note reorder applies.
 */
export default function SettingsRoute() {
  const { t } = useTranslation();
  const noteRefFilesetId = useBibleStore(
    (state) => state.noteRefFilesetId
  );
  const setNoteRefFilesetId = useBibleStore(
    (state) => state.setNoteRefFilesetId
  );
  const translations = useBibleStore(
    (state) => state.translations
  );
  const confirmNoteReorder = useBibleStore(
    (state) => state.confirmNoteReorder
  );
  const setConfirmNoteReorder = useBibleStore(
    (state) => state.setConfirmNoteReorder
  );
  const [pickerOpen, setPickerOpen] = useState(false);

  // Name the pin through the merged translations list — a
  // language whose list was never fetched falls back to the
  // raw fileset id.
  const pinnedOwner = findTranslationByFilesetId(
    noteRefFilesetId,
    translations
  );
  const pinnedLabel = pinnedOwner
    ? `${pinnedOwner.name} (${pinnedOwner.abbr})`
    : noteRefFilesetId;

  // Derived, not stored: cancelling the picker leaves the
  // control on "Selected translation" automatically.
  const mode = noteRefFilesetId ? 'pinned' : 'selected';

  const handleModeChange = (value: string) => {
    if (value === 'pinned') {
      setPickerOpen(true);
    } else {
      setNoteRefFilesetId(null);
    }
  };

  return (
    <Box p="md" maw={640} mx="auto">
      <Title order={2} mb="md">
        {t('settings.title')}
      </Title>
      <Radio.Group
        value={mode}
        onChange={handleModeChange}
        label={t('settings.noteRefTranslation')}
        description={t('settings.noteRefHint')}
      >
        <Stack spacing="xs" mt="xs">
          <Radio
            value="selected"
            label={t('settings.followSelected')}
          />
          <Radio
            value="pinned"
            label={t('settings.pinSpecific')}
          />
        </Stack>
      </Radio.Group>

      {noteRefFilesetId && (
        <Group spacing="xs" mt="sm">
          <Text size="sm" color="dimmed">
            {pinnedLabel}
          </Text>
          <Button
            variant="subtle"
            size="xs"
            onClick={() => setPickerOpen(true)}
          >
            {t('settings.change')}
          </Button>
          <Button
            variant="subtle"
            size="xs"
            color="gray"
            onClick={() => setNoteRefFilesetId(null)}
          >
            {t('settings.reset')}
          </Button>
        </Group>
      )}

      {pickerOpen && (
        <TranslationSelector
          opened
          onClose={() => setPickerOpen(false)}
          pickTextOnly
          seedFilesetId={noteRefFilesetId}
          onPickText={(id) => {
            setNoteRefFilesetId(id);
            setPickerOpen(false);
          }}
        />
      )}

      <Divider my="lg" />

      <Switch
        checked={confirmNoteReorder}
        onChange={(event) =>
          setConfirmNoteReorder(event.currentTarget.checked)
        }
        label={t('settings.confirmReorder')}
        description={t('settings.confirmReorderHint')}
        aria-label={t('settings.confirmReorder')}
      />
    </Box>
  );
}
