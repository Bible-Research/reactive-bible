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
import { useNavigate } from "react-router-dom";
import { useBibleStore } from "../store";

interface MainMenuProps {
  opened: boolean;
  onClose: () => void;
  colorScheme: ColorScheme;
  toggleColorScheme: () => void;
}

const MainMenu = ({
  opened,
  onClose,
  colorScheme,
  toggleColorScheme,
}: MainMenuProps) => {
  const theme = useMantineTheme();
  const navigate = useNavigate();
  
  // Get state from Zustand store
  const showNotes = useBibleStore((state) => state.showNotes);
  const activeBook = useBibleStore((state) => state.activeBook);
  const activeChapter = useBibleStore((state) => state.activeChapter);
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
              if (showNotes) {
                // Navigate back to Bible
                console.log(`🔗 MainMenu: Navigate to Bible ${activeBook}/${activeChapter}`);
                navigate(`/bible/${activeBook}/${activeChapter}`);
              } else {
                // Navigate to Notes
                console.log('🔗 MainMenu: Navigate to /notes');
                navigate('/notes');
              }
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
