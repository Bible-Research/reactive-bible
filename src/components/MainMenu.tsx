import {
  Drawer,
  Stack,
  ActionIcon,
  Switch,
  Group,
  Text,
  useMantineTheme,
  ColorScheme,
} from "@mantine/core";
import { IconX, IconSun, IconMoonStars } from "@tabler/icons-react";

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
        <Group position="apart" spacing="xs">
          <Text
            weight={500}
            size="lg"
            onClick={() => {
              setShowNotes(!showNotes);
              onClose();
            }}
            sx={{ cursor: "pointer" }}
          >
            {showNotes ? "View Bible" : "View Notes"}
          </Text>
        </Group>

        <Group position="apart" spacing="xs">
          <Text weight={500} size="lg">Theme</Text>
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
