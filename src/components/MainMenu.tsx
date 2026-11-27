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
  IconChecklist,
  IconMail,
  IconRocket,
  IconSettings,
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
import {
  isNativeApp,
  isPreviewDeploy,
  isNoteSharingEnabled,
} from "../utils/platform";
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
// Preview-deploys only (see isPreviewDeploy): the QA checklist
// of PRs merged to staging but not yet promoted to main.
const StagingChecklistModal = lazyWithReload(
  () => import("./StagingChecklistModal")
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
  const [checklistOpened, setChecklistOpened] = useState(false);
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
  const autoTranslateNotes = useBibleStore(
    (state) => state.autoTranslateNotes
  );
  const setAutoTranslateNotes = useBibleStore(
    (state) => state.setAutoTranslateNotes
  );

  // Offer the APK only on Android browsers — useless on iOS,
  // desktop, and inside the native shell itself.
  const showAndroidDownload =
    !isNativeApp() &&
    typeof navigator !== 'undefined' &&
    /android/i.test(navigator.userAgent);

  // A modal opened from the menu closes the menu like every
  // other item does — two focus-trapped overlays must not
  // stack (the top one's aria-hidden pass would hide the
  // drawer while it still holds focus). While a modal is
  // open the drawer also skips returnFocus: the +10ms
  // refocus would land on the menu button inside the
  // still-aria-hidden app root (the other half of Chrome's
  // "Blocked aria-hidden" warning). When the modal closes,
  // `modalOpened` flipping false re-arms `useFocusReturn`
  // (shouldReturnFocus changes while `opened` stays false),
  // so the drawer's refocus to the burger button still
  // fires on modal close — the desired focus-back-to-
  // invoker outcome, though a `useFocusReturn` side effect
  // rather than an explicit contract.
  const modalOpened =
    newNoteOpened || contactOpened || checklistOpened;

  return (
    <>
      <Drawer
        opened={opened}
        onClose={onClose}
        position="right"
        size="100%"
        withCloseButton={false}
        padding="xl"
        returnFocus={!modalOpened}
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

        {/* The published directory is public — everyone can
            browse /explore. */}
        <Group position="apart" spacing="xs">
          <Text
            weight={500}
            size="lg"
            onClick={() => {
              void navigate('/explore');
              onClose();
            }}
            sx={{ cursor: "pointer" }}
          >
            {t('menu.explore')}
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

        {/* /shared and /bookmarks auto-fetch endpoints that
            exist only on the unshipped sharing backend
            (bible_research#163) — hidden where the gate says
            the feature is unavailable. */}
        {isAuthenticated && isNoteSharingEnabled() && (
          <Group position="apart" spacing="xs">
            <Text
              weight={500}
              size="lg"
              onClick={() => {
                void navigate('/shared');
                onClose();
              }}
              sx={{ cursor: "pointer" }}
            >
              {t('menu.sharedWithMe')}
            </Text>
          </Group>
        )}

        {isAuthenticated && isNoteSharingEnabled() && (
          <Group position="apart" spacing="xs">
            <Text
              weight={500}
              size="lg"
              onClick={() => {
                void navigate('/bookmarks');
                onClose();
              }}
              sx={{ cursor: "pointer" }}
            >
              {t('menu.bookmarks')}
            </Text>
          </Group>
        )}

        {isAuthenticated && (
          <>
            <Group position="apart" spacing="xs">
              <Text
                weight={500}
                size="lg"
                onClick={() => {
                  setNewNoteOpened(true);
                  onClose();
                }}
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
              onClick={() => {
                setContactOpened(true);
                onClose();
              }}
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

        {/* Ungated: settings are device-local preferences. */}
        <Group spacing="xs" align="flex-start" noWrap>
          <IconSettings
            size={22}
            style={{ marginTop: 4, flexShrink: 0 }}
          />
          <div>
            <Text
              weight={500}
              size="lg"
              onClick={() => {
                void navigate('/settings');
                onClose();
              }}
              sx={{ cursor: "pointer" }}
              title={t('menu.settings')}
            >
              {t('menu.settings')}
            </Text>
          </div>
        </Group>

        {/* Release-testers' aid — meaningful only where the
            staging-branch preview actually runs. */}
        {isPreviewDeploy() && (
          <Group spacing="xs" align="flex-start" noWrap>
            <IconChecklist
              size={22}
              style={{ marginTop: 4, flexShrink: 0 }}
            />
            <div>
              <Text
                weight={500}
                size="lg"
                onClick={() => {
                  setChecklistOpened(true);
                  onClose();
                }}
                sx={{ cursor: "pointer" }}
                title={t('menu.stagingChecklist')}
              >
                {t('menu.stagingChecklist')}
              </Text>
              <Text size="xs" color="dimmed">
                {t('menu.stagingChecklistHint')}
              </Text>
            </div>
          </Group>
        )}

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

        <Divider />

        <Group position="apart" spacing="xs">
          <div>
            <Text weight={500} size="lg">
              {t('menu.autoTranslateNotes')}
            </Text>
            <Text size="xs" color="dimmed">
              {t('menu.autoTranslateNotesHint')}
            </Text>
          </div>
          <Switch
            checked={autoTranslateNotes}
            onChange={(event) =>
              setAutoTranslateNotes(event.currentTarget.checked)
            }
            size="lg"
            aria-label={t('menu.autoTranslateNotes')}
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
      {/* Mounted (not just when open) so ticked checklist state
          survives closing the modal to go click through the
          app — a tester must be able to perform a step, then
          come back and tick it off. Chunk stays tiny and only
          loads where the entry can exist. */}
      {isPreviewDeploy() && (
        <Suspense fallback={null}>
          <StagingChecklistModal
            opened={checklistOpened}
            onClose={() => setChecklistOpened(false)}
          />
        </Suspense>
      )}
    </>
  );
};

export default MainMenu;
