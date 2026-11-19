/**
 * NoteCard's translation controls (language switcher, status
 * chips, author verification, peek) — rendered only when
 * `useNoteTranslation.enabled` is true: the "Auto-translate
 * notes" setting is ON, the note has a detected source
 * language, and at least one other language exists.
 */
import { useTranslation } from 'react-i18next';
import {
  Badge,
  Button,
  Group,
  Loader,
  SegmentedControl,
  Text,
} from '@mantine/core';
import {
  IconCheck,
  IconRefresh,
  IconRotate,
} from '@tabler/icons-react';
import type { NoteLanguageState } from '../hooks/useNoteTranslation';

interface NoteLanguageBarProps {
  state: NoteLanguageState;
  sourceLang: string | null;
  isOwner: boolean;
}

const NoteLanguageBar = ({
  state,
  sourceLang,
  isOwner,
}: NoteLanguageBarProps) => {
  const { t } = useTranslation();
  const selectedMeta = state.translations.find(
    (m) => m.language === state.selectedLang
  );
  const translatedView =
    !!state.servedLang &&
    !!sourceLang &&
    state.servedLang !== sourceLang &&
    !state.peekingOriginal;
  const hasFailed = state.translations.some(
    (m) => m.status === 'failed'
  );
  const hasPending = state.translations.some(
    (m) => m.status === 'pending'
  );

  return (
    <Group position="apart" spacing="xs" mt={6} noWrap>
      <Group spacing={6} noWrap sx={{ minWidth: 0 }}>
        <SegmentedControl
          size="xs"
          value={state.selectedLang ?? undefined}
          onChange={state.selectLanguage}
          data={state.languages.map((lang) => ({
            value: lang,
            label: lang.toUpperCase(),
          }))}
          aria-label={t('notes.translation.language')}
        />
        {state.switching && <Loader size="xs" />}
      </Group>
      <Group spacing={6} noWrap>
        {translatedView && (
          <Text size="xs" color="dimmed">
            {t('notes.translation.autoTranslated')}
          </Text>
        )}
        {translatedView && sourceLang && (
          <Badge size="xs" variant="outline">
            {sourceLang.toUpperCase()}
          </Badge>
        )}
        {selectedMeta?.verified && (
          <Badge
            size="xs"
            color="teal"
            leftSection={<IconCheck size={10} />}
          >
            {t('notes.translation.verifiedByAuthor')}
          </Badge>
        )}
        {hasPending && (
          <Text size="xs" color="dimmed">
            {t('notes.translation.translating')}
          </Text>
        )}
        {hasFailed && isOwner && (
          <Button
            size="xs"
            compact
            variant="subtle"
            color="red"
            leftIcon={<IconRotate size={12} />}
            loading={state.acting}
            onClick={state.retryFailed}
          >
            {t('notes.translation.retry')}
          </Button>
        )}
        {hasFailed && !isOwner && (
          <Text size="xs" color="red">
            {t('notes.translation.failed')}
          </Text>
        )}
        {isOwner &&
          selectedMeta?.status === 'ready' && (
            <Button
              size="xs"
              compact
              variant="subtle"
              leftIcon={<IconCheck size={12} />}
              loading={state.acting}
              onClick={() =>
                state.verifySelected(!selectedMeta.verified)
              }
            >
              {selectedMeta.verified
                ? t('notes.translation.unverify')
                : t('notes.translation.verify')}
            </Button>
          )}
        {isOwner && hasFailed === false && hasPending &&
          !translatedView && (
            <Text size="xs" color="dimmed">
              {t('notes.translation.updating')}
            </Text>
          )}
        <Button
          size="xs"
          compact
          variant="subtle"
          leftIcon={<IconRefresh size={12} />}
          onClick={() =>
            state.setPeekingOriginal(!state.peekingOriginal)
          }
        >
          {state.peekingOriginal
            ? t('notes.translation.hideOriginal')
            : t('notes.translation.showOriginal')}
        </Button>
      </Group>
    </Group>
  );
};

export default NoteLanguageBar;
