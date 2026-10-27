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
import { shallow } from "zustand/shallow";
import { useBibleStore } from "../store";
import { useAuthStore } from "../stores/authStore";
import { sendUserReport } from "../utils/userReport";

interface ReportProblemModalProps {
  opened: boolean;
  onClose: () => void;
}

const NOTE_MAX_LENGTH = 1000;

const ReportProblemModal = ({
  opened,
  onClose,
}: ReportProblemModalProps) => {
  const [note, setNote] = useState("");
  const username = useAuthStore((state) => state.user?.username);
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
      title: sent ? 'Report sent' : 'Report not sent',
      message: sent
        ? 'Thanks — the report is on its way.'
        : 'Could not send the report. Please try again later.',
      color: sent ? 'green' : 'red',
    });
    setNote("");
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Report a problem"
    >
      <Stack spacing="md">
        <Text size="sm" color="dimmed">
          Tell us what went wrong — the report is sent with your
          current passage for context.
        </Text>
        <Textarea
          label="What went wrong?"
          placeholder={
            "e.g. The next-chapter button does nothing " +
            "when the screen is locked"
          }
          minRows={3}
          maxLength={NOTE_MAX_LENGTH}
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
          data-autofocus
        />
        <Group position="right" spacing="xs">
          <Button variant="subtle" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={!note.trim()}
          >
            Send report
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

export default ReportProblemModal;
