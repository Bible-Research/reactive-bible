import { useState } from "react";
import {
  Button,
  Group,
  Modal,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import { useMediaQuery } from "@mantine/hooks";
import { shallow } from "zustand/shallow";
import { useBibleStore } from "../store";
import { useAuthStore } from "../stores/authStore";
import { sendUserReport } from "../utils/userReport";
import type { ReportCategory } from "../utils/userReport";
import { useTranslation } from 'react-i18next';

interface ContactModalProps {
  opened: boolean;
  onClose: () => void;
}

const NOTE_MAX_LENGTH = 1000;
const CATEGORIES: ReportCategory[] = [
  'bug',
  'feature',
  'general',
];

const ContactModal = ({
  opened,
  onClose,
}: ContactModalProps) => {
  const { t } = useTranslation();
  const [note, setNote] = useState("");
  const [email, setEmail] = useState("");
  // Bug stays the default — the old flow is unchanged
  // muscle-memory-wise and misfiled bugs are minimized.
  const [category, setCategory] =
    useState<ReportCategory>('bug');
  const username = useAuthStore((state) => state.user?.username);
  // On phones the centered dialog leaves the textarea a few
  // rows tall; go full-screen and let the input fill the
  // space instead (same breakpoint as VerseActionToolbar and
  // TranslationSelector).
  const isMobile = useMediaQuery("(max-width: 768px)");
  // The current passage ships with the report so "this button
  // doesn't work" reports can be reproduced.
  const context = useBibleStore(
    (state) => ({
      bookId: state.activeBookId,
      chapter: state.activeChapter,
      textFilesetId: state.activeTextFilesetId,
      audioFilesetId: state.activeAudioFilesetId,
    }),
    shallow
  );

  const reset = () => {
    setNote("");
    setEmail("");
    setCategory('bug');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSend = () => {
    const sent = sendUserReport({
      message: note,
      username,
      category,
      email: email.trim() || undefined,
      context,
    });
    showNotification({
      title: sent
        ? t(`report.${category}.sentTitle`)
        : t('report.notSent'),
      message: sent
        ? t(`report.${category}.sentMessage`)
        : t('report.failed'),
      color: sent ? 'green' : 'red',
    });
    // On failure keep the dialog open so the typed note (and
    // reply email) survive — the user can retry or copy it.
    if (sent) {
      reset();
      onClose();
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={t(`report.${category}.title`)}
      fullScreen={isMobile}
      styles={
        isMobile
          ? {
              content: {
                display: "flex",
                flexDirection: "column",
              },
              body: {
                flex: 1,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
              },
            }
          : {}
      }
    >
      <Stack
        spacing="md"
        sx={isMobile ? { flex: 1, minHeight: 0 } : undefined}
      >
        <SegmentedControl
          value={category}
          onChange={(value) =>
            setCategory(value as ReportCategory)
          }
          data={CATEGORIES.map((value) => ({
            value,
            label: t(`report.category.${value}`),
          }))}
          fullWidth
          role="radiogroup"
          aria-label={t('report.categoryLabel')}
        />
        <Text size="sm" color="dimmed">
          {t(`report.${category}.hint`)}
        </Text>
        <Textarea
          label={t(`report.${category}.label`)}
          placeholder={t(`report.${category}.placeholder`)}
          minRows={3}
          maxLength={NOTE_MAX_LENGTH}
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
          data-autofocus
          sx={
            isMobile
              ? {
                  flex: 1,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                }
              : undefined
          }
          styles={
            isMobile
              ? {
                  wrapper: {
                    flex: 1,
                    minHeight: 0,
                    display: "flex",
                    flexDirection: "column",
                  },
                  input: {
                    flex: 1,
                    minHeight: 0,
                    resize: "none",
                  },
                }
              : {}
          }
        />
        {/* Signed-in users already send their username — the
            optional reply address exists for anonymous ones. */}
        {!username && (
          <TextInput
            type="email"
            label={t('report.emailLabel')}
            value={email}
            onChange={(e) =>
              setEmail(e.currentTarget.value)
            }
          />
        )}
        <Group position="right" spacing="xs">
          <Button variant="subtle" onClick={handleClose}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleSend}
            disabled={!note.trim()}
          >
            {t('report.submit')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

export default ContactModal;
