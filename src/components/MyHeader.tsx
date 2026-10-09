import {
  ActionIcon,
  Box,
  Burger,
  Center,
  Header,
  useMantineTheme,
} from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Audio from "./Audio";
import TranslationSelector from "./TranslationSelector";

const HEADER_HEIGHT = 56;
// px of accumulated scroll in one direction needed to toggle the
// header — roughly "two swipes". Small scrolls are ignored so the
// header does not flicker while reading.
const HIDE_SCROLL_DELTA = 150;
const SHOW_SCROLL_DELTA = 150;

const MyHeader = ({
  menuOpened,
  setMenuOpened,
}: {
  menuOpened: boolean;
  setMenuOpened: (opened: boolean) => void;
}) => {
  const theme = useMantineTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [visible, setVisible] = useState(true);
  const scroll = useRef({
    target: null as EventTarget | null,
    top: 0,
    down: 0,
    up: 0,
  });

  // Show the header again whenever the route changes.
  useEffect(() => {
    setVisible(true);
  }, [location.pathname]);

  useEffect(() => {
    const getScrollTop = (target: EventTarget | null): number =>
      target instanceof HTMLElement
        ? target.scrollTop
        : document.documentElement.scrollTop;

    const handleScroll = (event: Event) => {
      // Only the main content scroll should toggle the header.
      // Scrolling inside the Bible selector navbar, menus,
      // dropdowns or modals must not hide the header buttons.
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest(
          '.mantine-Navbar-root, [role="dialog"], ' +
            '[role="menu"], .mantine-Menu-dropdown, ' +
            '.mantine-Select-dropdown, .mantine-Popover-dropdown'
        )
      ) {
        return;
      }

      const state = scroll.current;
      const top = getScrollTop(event.target);

      // A different element started scrolling (e.g. after a route
      // change) — treat its position as the new baseline.
      if (event.target !== state.target) {
        state.target = event.target;
        state.top = top;
        state.down = 0;
        state.up = 0;
        return;
      }

      const delta = top - state.top;
      state.top = top;

      if (delta > 0) {
        state.down += delta;
        state.up = 0;
        if (state.down >= HIDE_SCROLL_DELTA && top > HEADER_HEIGHT) {
          setVisible(false);
        }
      } else if (delta < 0) {
        state.up -= delta;
        state.down = 0;
        if (state.up >= SHOW_SCROLL_DELTA) {
          setVisible(true);
        }
      }
    };

    // The app scrolls inside nested containers (the passage view,
    // Mantine ScrollArea), not on window. Scroll events do not
    // bubble, so listen in the capture phase to catch them all.
    window.addEventListener("scroll", handleScroll, {
      passive: true,
      capture: true,
    });
    return () =>
      window.removeEventListener("scroll", handleScroll, true);
  }, []);

  return (
    <Header
      height={HEADER_HEIGHT}
      data-header-visible={visible}
      sx={{
        transform: visible ? "translateY(0)" : "translateY(-100%)",
        transition: "transform 0.3s ease-in-out",
      }}
    >
      <Center
        h={HEADER_HEIGHT}
        px={10}
        mx="auto"
        sx={{
          display: "flex",
          justifyContent: "center",
          position: "relative",
        }}
      >
        <Box
          sx={{
            display: "flex",
            gap: "1rem",
            alignItems: "center",
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            maxWidth: "78.125%",
            width: "100%",
          }}
        >
          <ActionIcon
            variant="transparent"
            onClick={() => navigate('/search')}
          >
            <IconSearch />
          </ActionIcon>
          <Audio />
          <TranslationSelector />
        </Box>
        <Box sx={{ position: "absolute", right: "10px" }}>
          <Burger
            opened={menuOpened}
            onClick={() => setMenuOpened(!menuOpened)}
            size="sm"
            color={theme.colors.gray[6]}
            title={menuOpened ? "Close menu" : "Open menu"}
          />
        </Box>
      </Center>
    </Header>
  );
};

export default MyHeader;
