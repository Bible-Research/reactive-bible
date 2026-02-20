import { Drawer, Stack, ActionIcon, Button } from "@mantine/core";
import { IconX } from "@tabler/icons-react";
import TranslationSelector from "./TranslationSelector";

interface MainMenuProps {
  opened: boolean;
  onClose: () => void;
  showNotes: boolean;
  setShowNotes: (show: boolean) => void;
}

const MainMenu = ({
  opened,
  onClose,
  showNotes,
  setShowNotes,
}: MainMenuProps) => {
  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="left"
      size="100%"
      withCloseButton={false}
      padding="xl"
    >
      <ActionIcon
        onClick={onClose}
        size="lg"
        variant="transparent"
        style={{ alignSelf: "flex-start", marginBottom: "2rem" }}
        title="Close menu"
      >
        <IconX size={24} />
      </ActionIcon>

      <Stack spacing="xl">
        <TranslationSelector />

        <Button
          variant="subtle"
          size="lg"
          fullWidth
          onClick={() => {
            setShowNotes(!showNotes);
            onClose();
          }}
        >
          {showNotes ? "View Bible" : "View Notes"}
        </Button>
      </Stack>
    </Drawer>
  );
};

export default MainMenu;
