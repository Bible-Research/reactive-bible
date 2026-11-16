import { useState } from "react";
import {
  Button,
  Group,
  Modal,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import { useMediaQuery } from "@mantine/hooks";
import { shallow } from "zustand/shallow";
import { useBibleStore } from "../store";
import { useAuthStore } from "../stores/authStore";
import { sendUserReport } from "../utils/userReport";
import { useTranslation } from 'react-i18next';

interface ReportProblemModalProps {
  opened: boolean;
  onClose: () => void;
}

const NOTE_MAX_LENGTH = 1000;

const ReportProblemModal = ({
  opened,
  onClose,
}: ReportProblemModalProps) => {
  const { t } = useTranslation();
  const [note, setNote] = useState("");
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

  const handleClose = () => {
    setNote("");
    onClose();
  };

  const handleSend = () => {
    const sent = sendUserReport({
      message: note,
      username,
      context,
    });
    showNotification({
      title: sent ? t('report.sent') : t('report.notSent'),
      message: sent
        ? t('report.thanks')
        : t('report.failed'),
      color: sent ? 'green' : 'red',
    });
    setNote("");
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={t('report.title')}
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
        <Text size="sm" color="dimmed">
          {t('report.hint')}
        </Text>
        <Textarea
          label={t('report.label')}
          placeholder={t('report.placeholder')}
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

export default ReportProblemModal;
