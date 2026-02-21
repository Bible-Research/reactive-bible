import {
  AppShell,
  MantineProvider,
  ColorSchemeProvider,
  ColorScheme,
} from "@mantine/core";
import { useDisclosure, useLocalStorage, useWindowEvent } from "@mantine/hooks";
import BibleSelector from "./components/BibleSelector";
import MyHeader from "./components/MyHeader";
import MainMenu from "./components/MainMenu";
import { useState, useEffect } from "react";
import Passage from "./components/Passage";
import { SearchModal } from "./components/SearchModal";
import { clearExpiredAudioUrls } from "./utils/cacheManager";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";

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
  
  // Notes view state (lifted from Passage)
  const [showNotes, setShowNotes] = useState(false);
  
  const [modalOpened, modalFn] = useDisclosure(false);

  // Clean up expired audio URLs on app load
  useEffect(() => {
    clearExpiredAudioUrls();
  }, []);
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
        <AppShell
          padding="md"
          navbar={
            <BibleSelector
              opened={bibleSelectorOpened}
              setOpened={setBibleSelectorOpened}
            />
          }
          header={
            <MyHeader
              menuOpened={mainMenuOpened}
              setMenuOpened={setMainMenuOpened}
              open={modalFn.open}
              setBibleSelectorOpened={setBibleSelectorOpened}
            />
          }
          styles={(theme) => ({
            main: {
              backgroundColor:
                theme.colorScheme === "dark"
                  ? theme.colors.dark[8]
                  : theme.colors.gray[0],
              height: "100vh",
            },
          })}
        >
          <Passage showNotes={showNotes} setShowNotes={setShowNotes} />
          <SearchModal opened={modalOpened} close={modalFn.close} />
          <MainMenu
            opened={mainMenuOpened}
            onClose={() => setMainMenuOpened(false)}
            showNotes={showNotes}
            setShowNotes={setShowNotes}
            colorScheme={colorScheme}
            toggleColorScheme={toggleColorScheme}
          />
        </AppShell>
        <Analytics />
        <SpeedInsights />
      </MantineProvider>
    </ColorSchemeProvider>
  );
}
