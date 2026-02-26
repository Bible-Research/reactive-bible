import { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import { AppShell, ColorScheme } from "@mantine/core";
import { useDisclosure, useWindowEvent, useLocalStorage } from "@mantine/hooks";
import BibleSelector from "../components/BibleSelector";
import MyHeader from "../components/MyHeader";
import MainMenu from "../components/MainMenu";
import BottomNav from "../components/BottomNav";
import { SearchModal } from "../components/SearchModal";
import { useBibleStore } from "../store";

export default function RootLayout() {
  // BibleSelector state
  const [bibleSelectorOpened, setBibleSelectorOpened] = useState(false);
  
  // MainMenu state
  const [mainMenuOpened, setMainMenuOpened] = useState(false);
  
  // Notes view state
  const [showNotes, setShowNotes] = useState(false);
  
  const [modalOpened, modalFn] = useDisclosure(false);
  
  // Color scheme management (moved from App.tsx)
  const [colorScheme, setColorScheme] = useLocalStorage<ColorScheme>({
    key: "color-scheme",
    defaultValue: "dark",
  });
  
  const toggleColorScheme = () =>
    setColorScheme((current) => (current === "dark" ? "light" : "dark"));

  const fetchAllNotes = useBibleStore((state) => state.fetchAllNotes);

  useEffect(() => {
    fetchAllNotes();
  }, [fetchAllNotes]);

  // Global keyboard shortcuts
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
    <>
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
          />
        }
        footer={
          <BottomNav setBibleSelectorOpened={setBibleSelectorOpened} />
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
        <Outlet context={{ showNotes, setShowNotes, setBibleSelectorOpened, colorScheme, toggleColorScheme }} />
      </AppShell>
      <SearchModal opened={modalOpened} close={modalFn.close} />
      <MainMenu
        opened={mainMenuOpened}
        onClose={() => setMainMenuOpened(false)}
        showNotes={showNotes}
        setShowNotes={setShowNotes}
        colorScheme={colorScheme}
        toggleColorScheme={toggleColorScheme}
      />
    </>
  );
}
