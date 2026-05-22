import {
  AppShell,
  MantineProvider,
  ColorSchemeProvider,
  ColorScheme,
} from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { ModalsProvider } from "@mantine/modals";
import { useDisclosure, useLocalStorage, useWindowEvent } from "@mantine/hooks";
import BibleSelector from "./components/BibleSelector";
import MyHeader from "./components/MyHeader";
import MainMenu from "./components/MainMenu";
import BottomNav from "./components/BottomNav";
import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { AppRoutes } from "./routes";
import { SearchModal } from "./components/SearchModal";
import { clearExpiredAudioUrls } from "./utils/cacheManager";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { useAuthStore } from "./stores/authStore";
import { ErrorBoundary } from "./components/ErrorBoundary";

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
  
  const [modalOpened, modalFn] = useDisclosure(false);

  // Check authentication on app load
  const checkAuth = useAuthStore((state) => state.checkAuth);
  
  useEffect(() => {
    // Check if user is authenticated from localStorage
    checkAuth();
    // Clean up expired audio URLs
    clearExpiredAudioUrls();
  }, [checkAuth]);
  
  // Check if we're on an auth page (login/register)
  const location = useLocation();
  const isAuthPage = location.pathname === '/login' || 
                     location.pathname === '/register';
  useWindowEvent("keydown", (event) => {
    if (event.key === "/") {
      event.preventDefault();
      modalFn.open();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      modalFn.close();
    }
  });
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
          padding="md"
          navbar={
            !isAuthPage ? (
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
              open={modalFn.open}
            />
          }
          footer={
            !isAuthPage ? (
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
              // Allow scrolling on auth pages
              overflow: isAuthPage ? "auto" : "hidden",
            },
          })}
        >
          <ErrorBoundary>
            <AppRoutes />
          </ErrorBoundary>
          <SearchModal opened={modalOpened} close={modalFn.close} />
          <MainMenu
            opened={mainMenuOpened}
            onClose={() => setMainMenuOpened(false)}
            colorScheme={colorScheme}
            toggleColorScheme={toggleColorScheme}
          />
        </AppShell>
        <Analytics />
        <SpeedInsights />
        </ModalsProvider>
      </MantineProvider>
    </ColorSchemeProvider>
  );
}
