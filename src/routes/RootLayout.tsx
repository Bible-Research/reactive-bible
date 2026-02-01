import { useState } from "react";
import { Outlet } from "react-router-dom";
import { AppShell, ColorScheme } from "@mantine/core";
import { useDisclosure, useWindowEvent, useLocalStorage } from "@mantine/hooks";
import MyNavbar from "../components/MyNavbar";
import MyHeader from "../components/MyHeader";
import { SearchModal } from "../components/SearchModal";

export default function RootLayout() {
  const [opened, setOpened] = useState(false);
  const [modalOpened, modalFn] = useDisclosure(false);
  
  // Color scheme management (moved from App.tsx)
  const [colorScheme, setColorScheme] = useLocalStorage<ColorScheme>({
    key: "color-scheme",
    defaultValue: "dark",
  });
  
  const toggleColorScheme = () =>
    setColorScheme((current) => (current === "dark" ? "light" : "dark"));

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
        navbar={<MyNavbar opened={opened} setOpened={setOpened} />}
        header={
          <MyHeader
            colorScheme={colorScheme}
            toggleColorScheme={toggleColorScheme}
            opened={opened}
            setOpened={setOpened}
            open={modalFn.open}
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
        <Outlet />
      </AppShell>
      <SearchModal opened={modalOpened} close={modalFn.close} />
    </>
  );
}
