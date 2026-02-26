import { useNavigate, useOutletContext } from "react-router-dom";
import { Box, ColorScheme } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import NotesView from "../components/NotesView";
import SubHeader from "../components/SubHeader";

interface OutletContext {
  showNotes: boolean;
  setShowNotes: (show: boolean) => void;
  setBibleSelectorOpened: (opened: boolean) => void;
  colorScheme: ColorScheme;
  toggleColorScheme: () => void;
}

export default function NotesListRoute() {
  const navigate = useNavigate();
  const { setBibleSelectorOpened, colorScheme, toggleColorScheme } = useOutletContext<OutletContext>();
  const [, modalFn] = useDisclosure(false);

  const handleViewInBible = (
    book: string,
    chapter: number,
    verse: number
  ) => {
    navigate(`/bible/${book}/${chapter}/${verse}`);
  };

  return (
    <Box style={{ flex: "1 0 100%" }}>
      <SubHeader 
        open={modalFn.open}
        setBibleSelectorOpened={setBibleSelectorOpened}
        colorScheme={colorScheme}
        toggleColorScheme={toggleColorScheme}
      />
      <NotesView onViewInBible={handleViewInBible} />
    </Box>
  );
}
