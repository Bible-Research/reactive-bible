import {
  Drawer,
  Stack,
  ActionIcon,
  Switch,
  Group,
  Text,
  useMantineTheme,
  ColorScheme,
  Divider,
} from "@mantine/core";
import {
  IconX,
  IconSun,
  IconMoonStars,
  IconBrandAndroid,
  IconRefresh,
} from "@tabler/icons-react";
import { Suspense, lazy, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBibleStore } from "../store";
import { useAuthStore } from "../stores/authStore";
import { buildBiblePath } from "../utils/bibleUtils";
import { isNativeApp } from "../utils/platform";
import { checkForUpdatesManually } from "../hooks/useAppUpdate";
import { UserMenu } from "./UserMenu";

// Lazy + gated below on newNoteOpened — the modal pulls in
// TipTap, which must stay out of the app-shell chunk.
const AddStandaloneNoteModal = lazy(
  () => import("./AddStandaloneNoteModal")
);

// The rolling `continuous` prerelease always serves the newest
// main build; `releases/latest` would serve the stale v* tag.
const ANDROID_APK_URL =
  'https://github.com/Bible-Research/reactive-bible/releases/' +
  'download/continuous/reactive-bible.apk';

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
  const [newNoteOpened, setNewNoteOpened] = useState(false);

  // Get Bible state for navigation
  const activeBookId = useBibleStore((state) => state.activeBookId);
  const activeChapter = useBibleStore((state) => state.activeChapter);
  // Write affordances (notes/tags are user-owned) are hidden
  // from anonymous visitors — /tags is protected, but the menu
  // must not offer unreachable actions either.
  const isAuthenticated = useAuthStore(
    (state) => state.isAuthenticated
  );

  // Offer the APK only on Android browsers — useless on iOS,
  // desktop, and inside the native shell itself.
  const showAndroidDownload =
    !isNativeApp() &&
    typeof navigator !== 'undefined' &&
    /android/i.test(navigator.userAgent);

  return (
    <>
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
        {/* User Account Section */}
        <Group position="apart" spacing="xs">
          <Text weight={500} size="lg">Account</Text>
          <UserMenu onNavigate={onClose} />
        </Group>
        
        <Divider />

        <Group position="apart" spacing="xs">
          <Text
            weight={500}
            size="lg"
            onClick={() => {
              void navigate(buildBiblePath(activeBookId, activeChapter));
              onClose();
            }}
            sx={{ cursor: "pointer" }}
          >
            Read Bible
          </Text>
        </Group>

        {/* /notes bounces anonymous visitors to /bible
            (NotesRoute), so the link is a dead end for
            them — hide it like the write affordances. */}
        {isAuthenticated && (
          <Group position="apart" spacing="xs">
            <Text
              weight={500}
              size="lg"
              onClick={() => {
                void navigate('/notes');
                onClose();
              }}
              sx={{ cursor: "pointer" }}
            >
              View Notes
            </Text>
          </Group>
        )}

        {isAuthenticated && (
          <>
            <Group position="apart" spacing="xs">
              <Text
                weight={500}
                size="lg"
                onClick={() => setNewNoteOpened(true)}
                sx={{ cursor: "pointer" }}
              >
                New Note
              </Text>
            </Group>

            <Group position="apart" spacing="xs">
              <Text
                weight={500}
                size="lg"
                onClick={() => {
                  void navigate('/tags');
                  onClose();
                }}
                sx={{ cursor: "pointer" }}
              >
                Tag Management
              </Text>
            </Group>
          </>
        )}

        {isNativeApp() && (
          <Group spacing="xs" align="flex-start" noWrap>
            <IconRefresh
              size={22}
              style={{ marginTop: 4, flexShrink: 0 }}
            />
            <div>
              <Text
                weight={500}
                size="lg"
                onClick={() => void checkForUpdatesManually()}
                sx={{ cursor: "pointer" }}
                title="Check for updates"
              >
                Check for updates
              </Text>
              <Text size="xs" color="dimmed">
                Look for a newer build on GitHub Releases.
              </Text>
            </div>
          </Group>
        )}

        {showAndroidDownload && (
          <>
            <Divider />
            <Group spacing="xs" align="flex-start" noWrap>
              <IconBrandAndroid
                size={22}
                style={{ marginTop: 4, flexShrink: 0 }}
              />
              <div>
                <Text
                  weight={500}
                  size="lg"
                  component="a"
                  href={ANDROID_APK_URL}
                  sx={{ cursor: "pointer", color: "inherit" }}
                  title="Download Android app"
                >
                  Download Android App
                </Text>
                <Text size="xs" color="dimmed">
                  For lock-screen audio playback. You may need to
                  allow "install unknown apps" for your browser.
                </Text>
              </div>
            </Group>
          </>
        )}

        <Divider />

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
      {isAuthenticated && newNoteOpened && (
        <Suspense fallback={null}>
          <AddStandaloneNoteModal
            opened={newNoteOpened}
            onClose={() => setNewNoteOpened(false)}
          />
        </Suspense>
      )}
    </>
  );
};

export default MainMenu;
