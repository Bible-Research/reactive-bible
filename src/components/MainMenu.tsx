import {
  Drawer,
  Stack,
  ActionIcon,
  Button,
  Switch,
  Group,
  Text,
  useMantineTheme,
  ColorScheme,
} from "@mantine/core";
import { IconX, IconSun, IconMoonStars } from "@tabler/icons-react";
import TranslationSelector from "./TranslationSelector";

interface MainMenuProps {
  opened: boolean;
  onClose: () => void;
  showNotes: boolean;
  setShowNotes: (show: boolean) => void;
  colorScheme: ColorScheme;
  toggleColorScheme: () => void;
}

const MainMenu = ({
  opened,
  onClose,
  showNotes,
  setShowNotes,
  colorScheme,
  toggleColorScheme,
}: MainMenuProps) => {
  const theme = useMantineTheme();
  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
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

        <Group position="apart">
          <Text weight={500}>Theme</Text>
          <Switch
            checked={colorScheme === "dark"}
            onChange={toggleColorScheme}
            size="lg"
            onLabel={
              <IconSun color={theme.white} size="1.25rem" stroke={1.5} />
            }
            offLabel={
              <IconMoonStars
                color={theme.colors.gray[6]}
                size="1.25rem"
                stroke={1.5}
              />
            }
          />
        </Group>
      </Stack>
    </Drawer>
  );
};

export default MainMenu;
