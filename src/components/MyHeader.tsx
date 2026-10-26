import {
  ActionIcon,
  Box,
  Burger,
  Center,
  Header,
  useMantineTheme,
} from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useBibleStore } from "../store";
import Audio from "./Audio";
import TranslationSelector from "./TranslationSelector";

const HEADER_HEIGHT = 56;
// px of accumulated scroll in one direction needed to toggle the
// header — roughly "two swipes". Small scrolls are ignored so the
// header does not flicker while reading.
const HIDE_SCROLL_DELTA = 150;
const SHOW_SCROLL_DELTA = 150;
// px from the bottom of the scroller that counts as "end of the
// chapter" — the bars always come back there so the reader can
// reach the next/previous buttons without scrolling up first.
const BOTTOM_REVEAL_PX = 24;

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
  // Visibility lives in the store so the AppShell can collapse
  // the padding it reserves for this header at the same time the
  // header slides away.
  const visible = useBibleStore((state) => state.headerVisible);
  const setVisible = useBibleStore(
    (state) => state.setHeaderVisible
  );
  const scroll = useRef({
    target: null as EventTarget | null,
    top: 0,
    down: 0,
    up: 0,
  });

  // Show the header again whenever the route changes.
  useEffect(() => {
    setVisible(true);
  }, [location.pathname, setVisible]);

  useEffect(() => {
    // Window-level scrolls report `document` as the target; fall
    // back to documentElement for its metrics then.
    const getScroller = (
      target: EventTarget | null
    ): HTMLElement =>
      target instanceof HTMLElement
        ? target
        : document.documentElement;

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
      const scroller = getScroller(event.target);
      const top = scroller.scrollTop;
      // Reached the end of the content — reveal the bars so the
      // chapter navigation stays reachable. Guarded on actual
      // overflow (scrollHeight > clientHeight) so non-scrollable
      // targets and jsdom's zero heights never trigger it.
      const atBottom =
        scroller.scrollHeight > scroller.clientHeight &&
        top + scroller.clientHeight >=
          scroller.scrollHeight - BOTTOM_REVEAL_PX;

      // A different element started scrolling (e.g. after a route
      // change) — treat its position as the new baseline.
      if (event.target !== state.target) {
        state.target = event.target;
        state.top = top;
        state.down = 0;
        state.up = 0;
        if (atBottom) setVisible(true);
        return;
      }

      const delta = top - state.top;
      state.top = top;

      if (atBottom) {
        state.down = 0;
        state.up = 0;
        setVisible(true);
        return;
      }

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
  }, [setVisible]);

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
