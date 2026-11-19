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
  SegmentedControl,
} from "@mantine/core";
import {
  IconX,
  IconSun,
  IconMoonStars,
  IconBrandAndroid,
  IconRefresh,
  IconMail,
  IconRocket,
} from "@tabler/icons-react";
import { Suspense, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useBibleStore } from "../store";
import { useAuthStore } from "../stores/authStore";
import { buildBiblePath } from "../utils/bibleUtils";
import {
  SUPPORTED_UI_LANGUAGES,
  UI_LANGUAGE_AUTONYMS,
  isUiLanguage,
} from "../i18n";
import { isNativeApp } from "../utils/platform";
import { checkForUpdatesManually } from "../hooks/useAppUpdate";
import { fetchNewestApkUrl } from "../utils/appUpdate";
import { lazyWithReload } from "../utils/lazyWithReload";
import { UserMenu } from "./UserMenu";

// Lazy + gated below on newNoteOpened — the modal pulls in
// TipTap, which must stay out of the app-shell chunk.
const AddStandaloneNoteModal = lazyWithReload(
  () => import("./AddStandaloneNoteModal")
);
const ContactModal = lazyWithReload(
  () => import("./ContactModal")
);

// Fallback while the newest versioned asset URL is resolved
// from the GitHub API (see fetchNewestApkUrl): `releases/latest`
// serves the newest v* milestone — a fixed asset name that is
// only re-uploaded on a re-tag, not on every main publish.
const ANDROID_APK_URL_FALLBACK =
  'https://github.com/Bible-Research/reactive-bible/releases/' +
  'latest/download/reactive-bible.apk';

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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [newNoteOpened, setNewNoteOpened] = useState(false);
  const [contactOpened, setContactOpened] = useState(false);
  // The stable-name continuous asset is deleted + re-uploaded on
  // every publish — resolve the freshest versioned APK instead
  // so the link can never hand out a truncated file.
  const [apkUrl, setApkUrl] = useState(ANDROID_APK_URL_FALLBACK);
  useEffect(() => {
    void fetchNewestApkUrl().then((url) => {
      if (url) setApkUrl(url);
    });
  }, []);

  // Get Bible state for navigation
  const activeBookId = useBibleStore((state) => state.activeBookId);
  const activeChapter = useBibleStore((state) => state.activeChapter);
  // Write affordances (notes/tags are user-owned) are hidden
  // from anonymous visitors — /tags is protected, but the menu
  // must not offer unreachable actions either.
  const isAuthenticated = useAuthStore(
    (state) => state.isAuthenticated
  );
  const uiLanguage = useBibleStore((state) => state.uiLanguage);
  const setUiLanguage = useBibleStore(
    (state) => state.setUiLanguage
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
      {/* Close X on the right: the drawer body is not a flex
          container, so use an auto inline-start margin (the
          block-level ActionIcon keeps a fixed width) — inert
          align-self did nothing here. */}
      <ActionIcon
        onClick={onClose}
        size="lg"
        variant="transparent"
        style={{
          marginInlineStart: "auto",
          marginBottom: "2rem",
        }}
        title={t('menu.closeMenu')}
      >
        <IconX size={24} />
      </ActionIcon>

      <Stack spacing="xl">
        {/* User Account Section */}
        <Group position="apart" spacing="xs">
          <Text weight={500} size="lg">{t('menu.account')}</Text>
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
            {t('menu.readBible')}
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
              {t('menu.viewNotes')}
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
                {t('menu.newNote')}
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
                {t('menu.tagManagement')}
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
                title={t('menu.checkUpdates')}
              >
                {t('menu.checkUpdates')}
              </Text>
              <Text size="xs" color="dimmed">
                {t('menu.checkUpdatesHint')}
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
                  href={apkUrl}
                  sx={{ cursor: "pointer", color: "inherit" }}
                  title={t('menu.downloadAndroidApp')}
                >
                  {t('menu.downloadAndroidApp')}
                </Text>
                <Text size="xs" color="dimmed">
                  {t('menu.downloadAndroidHint')}
                </Text>
              </div>
            </Group>
          </>
        )}

        {/* Ungated: new anonymous users are the audience. */}
        <Group spacing="xs" align="flex-start" noWrap>
          <IconRocket
            size={22}
            style={{ marginTop: 4, flexShrink: 0 }}
          />
          <div>
            <Text
              weight={500}
              size="lg"
              onClick={() => {
                void navigate('/getting-started');
                onClose();
              }}
              sx={{ cursor: "pointer" }}
              title={t('menu.gettingStarted')}
            >
              {t('menu.gettingStarted')}
            </Text>
            <Text size="xs" color="dimmed">
              {t('menu.gettingStartedHint')}
            </Text>
          </div>
        </Group>

        <Group spacing="xs" align="flex-start" noWrap>
          <IconMail
            size={22}
            style={{ marginTop: 4, flexShrink: 0 }}
          />
          <div>
            <Text
              weight={500}
              size="lg"
              onClick={() => setContactOpened(true)}
              sx={{ cursor: "pointer" }}
              title={t('menu.contactDeveloper')}
            >
              {t('menu.contactDeveloper')}
            </Text>
            <Text size="xs" color="dimmed">
              {t('menu.contactDeveloperHint')}
            </Text>
          </div>
        </Group>

        <Divider />

        <Group position="apart" spacing="xs">
          <Text weight={500} size="lg">{t('menu.theme')}</Text>
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

        <Group position="apart" spacing="xs">
          <Text weight={500} size="lg">{t('menu.language')}</Text>
          {/* Autonyms are intentional — a user who can't read
              the current UI language must still find theirs. */}
          <SegmentedControl
            value={uiLanguage}
            onChange={(value) => {
              if (isUiLanguage(value)) setUiLanguage(value);
            }}
            data={SUPPORTED_UI_LANGUAGES.map((lang) => ({
              value: lang,
              label: UI_LANGUAGE_AUTONYMS[lang],
            }))}
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
      {contactOpened && (
        <Suspense fallback={null}>
          <ContactModal
            opened={contactOpened}
            onClose={() => setContactOpened(false)}
          />
        </Suspense>
      )}
    </>
  );
};

export default MainMenu;
