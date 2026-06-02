import {
  ActionIcon,
  Box,
  Burger,
  Center,
  Header,
  useMantineTheme,
} from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { useState, useEffect } from "react";
import Audio from "./Audio";
import TranslationSelector from "./TranslationSelector";

const MyHeader = ({
  menuOpened,
  setMenuOpened,
  open,
}: {
  menuOpened: boolean;
  setMenuOpened: (opened: boolean) => void;
  open: () => void;
}) => {
  const theme = useMantineTheme();
  const [visible, setVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      
      if (currentScrollY > lastScrollY && currentScrollY > 50) {
        // Scrolling down and past threshold
        setVisible(false);
      } else if (currentScrollY < lastScrollY) {
        // Scrolling up
        setVisible(true);
      }
      
      setLastScrollY(currentScrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

  return (
    <Header
      height={56}
      sx={{
        transform: visible ? 'translateY(0)' : 'translateY(-100%)',
        transition: 'transform 0.3s ease-in-out',
      }}
    >
      <Center
        h={56}
        px={10}
        mx="auto"
        sx={{ display: "flex", justifyContent: "center", position: "relative" }}
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
          <ActionIcon variant="transparent" onClick={open}>
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
