import {
  AppShell,
  MantineProvider,
  ColorSchemeProvider,
  ColorScheme,
} from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { ModalsProvider } from "@mantine/modals";
import { useLocalStorage } from "@mantine/hooks";
import BibleSelector from "./components/BibleSelector";
import MyHeader from "./components/MyHeader";
import MainMenu from "./components/MainMenu";
import BottomNav from "./components/BottomNav";
import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { AppRoutes } from "./routes";
import { clearExpiredAudioUrls } from "./utils/cacheManager";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { isNativeApp } from "./utils/platform";
import { useAuthStore } from "./stores/authStore";
import { useAppUpdate } from "./hooks/useAppUpdate";
import { useBibleStore } from "./store";
import { ErrorBoundary } from "./components/ErrorBoundary";
import VerseActionToolbar from "./components/VerseActionToolbar";
import { useSlashSearchShortcut } from "./hooks/useSlashSearchShortcut";

export default function App() {
  const [colorScheme, setColorScheme] = useLocalStorage<ColorScheme>({
    key: "color-scheme",
    defaultValue: "dark",
  });
  const toggleColorScheme = () =>
    setColorScheme((current) => (current === "dark" ? "light" : "dark"));
  
  // BibleSelector state
  const [bibleSelectorOpened, setBibleSelectorOpened] = useState(false);
  
  // MainMenu state
  const [mainMenuOpened, setMainMenuOpened] = useState(false);

  // Check authentication on app load
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const isAuthenticated = useAuthStore(
    (state) => state.isAuthenticated
  );

  useEffect(() => {
    // Check if user is authenticated from localStorage
    checkAuth();
    // Clean up expired audio URLs
    clearExpiredAudioUrls();
  }, [checkAuth]);

  // Poll the rolling `continuous` release for a newer APK build
  // (no-op outside the native Android shell).
  useAppUpdate();

  // Reading positions are only synced for authenticated users;
  // anonymous sessions share a server-side guest account.
  useEffect(() => {
    if (isAuthenticated) {
      void useBibleStore.getState().prefetchReadingPositions();
    }
  }, [isAuthenticated]);
  
  // Check if we're on an auth page (login/register)
  const location = useLocation();
  const isAuthPage = location.pathname === '/login' ||
                     location.pathname === '/register';
  const isSearchPage = location.pathname === '/search';
  const isBibleView = location.pathname.startsWith('/bible');
  const isNotesView = location.pathname.startsWith('/notes');
  const showVerseToolbar = isBibleView || isNotesView;
  // MyHeader and BottomNav slide away on downward scroll; drop
  // the padding the AppShell reserves for them so content
  // reclaims the space.
  const headerVisible = useBibleStore(
    (state) => state.headerVisible
  );
  // The audio player is fixed to the viewport bottom (~120px)
  // and never hides on scroll — keep clearing it even once
  // the header/footer chrome has slid away.
  const showAudioPlayer = useBibleStore(
    (state) => state.showAudioPlayer
  );
  // "/" opens search — the hook also guards contenteditable
  // targets so TipTap note edits are not hijacked.
  useSlashSearchShortcut();
  return (
    <ColorSchemeProvider
      colorScheme={colorScheme}
      toggleColorScheme={toggleColorScheme}
    >
      <MantineProvider
        theme={{ colorScheme }}
        withGlobalStyles
        withNormalizeCSS
      >
        <ModalsProvider>
        <Notifications position="top-right" zIndex={2077} />
        <AppShell
          padding={0}
          navbar={
            isBibleView ? (
              <BibleSelector
                opened={bibleSelectorOpened}
                setOpened={setBibleSelectorOpened}
              />
            ) : undefined
          }
          header={
            <MyHeader
              menuOpened={mainMenuOpened}
              setMenuOpened={setMainMenuOpened}
            />
          }
          footer={
            isBibleView ? (
              <BottomNav setBibleSelectorOpened={setBibleSelectorOpened} />
            ) : undefined
          }
          styles={(theme) => ({
            main: {
              backgroundColor:
                theme.colorScheme === "dark"
                  ? theme.colors.dark[8]
                  : theme.colors.gray[0],
              height: "100vh",
              paddingTop: headerVisible
                ? "var(--mantine-header-height, 0px)"
                : 0,
              paddingBottom: headerVisible
                ? "var(--mantine-footer-height, 0px)"
                : showAudioPlayer
                  ? "120px"
                  : 0,
              transition:
                "padding-top 0.3s ease-in-out, " +
                "padding-bottom 0.3s ease-in-out",
              // Allow scrolling on auth and search pages
              overflow: (isAuthPage || isSearchPage) ? "auto" : "hidden",
            },
          })}
        >
          {/* `key` on the top-level route segment remounts the
              boundary on section changes (/bible -> /notes)
              without remounting the route tree on intra-page URL
              updates like verse-selection refs (/bible/JHN.1 ->
              /bible/JHN.1.3), which would unload PassageView and
              swallow clicks mid-remount. `resetKey` recovers a
              caught error on ANY pathname change — e.g.
              /notes/tag/a -> /notes/tag/b stays under the same
              segment key — but only fires in the error state,
              so healthy children are never remounted. */}
          <ErrorBoundary
            key={location.pathname.split('/')[1]}
            resetKey={location.pathname}
          >
            <AppRoutes />
          </ErrorBoundary>
          {showVerseToolbar && <VerseActionToolbar />}
          <MainMenu
            opened={mainMenuOpened}
            onClose={() => setMainMenuOpened(false)}
            colorScheme={colorScheme}
            toggleColorScheme={toggleColorScheme}
          />
        </AppShell>
        {/* Vercel telemetry injects /_vercel/* scripts that only
            exist on the Vercel deployment; inside the Capacitor
            shell (origin https://localhost) they 404 and trip the
            resource-load error reporter. */}
        {!isNativeApp() && (
          <>
            <Analytics />
            <SpeedInsights />
          </>
        )}
        </ModalsProvider>
      </MantineProvider>
    </ColorSchemeProvider>
  );
}
