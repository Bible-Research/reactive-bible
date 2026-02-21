import {
  ActionIcon,
  Box,
  Burger,
  Center,
  Header,
  Text,
  useMantineTheme,
} from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { useState } from "react";
import AddTagNoteModal from "./AddTagNoteModal";
import Audio from "./Audio";

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
  const [noteModalOpened, setNoteModalOpened] = useState(false);

  return (
    <Header height={56}>
      <Center
        h={56}
        px={10}
        mx="auto"
        sx={{ display: "flex", justifyContent: "center", position: "relative" }}
      >
        <Box
          sx={{
            display: "flex",
            gap: "0.5rem",
            alignItems: "center",
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
          }}
        >
          <ActionIcon variant="transparent" onClick={open}>
            <IconSearch />
          </ActionIcon>
          <Text
            weight={500}
            size="lg"
            onClick={() => setNoteModalOpened(true)}
            sx={{ cursor: "pointer" }}
          >
            Add Note
          </Text>
          {noteModalOpened && (
            <AddTagNoteModal
              opened={noteModalOpened}
              onClose={() => setNoteModalOpened(false)}
            />
          )}
          <Audio />
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
