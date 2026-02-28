
import { Box } from "@mantine/core";
import { useBibleStore } from "../store";
import PassageView from "./PassageView";
import NotesView from "./NotesView";

const Passage = () => {
  // Get showNotes from store instead of props
  const showNotes = useBibleStore((state) => state.showNotes);

  return (
    <Box style={{ flex: "1 0 100%", height: "100%" }}>
      <Box style={{ height: "100%", overflow: "auto" }}>
        {showNotes ? (
          <NotesView />
        ) : (
          <PassageView />
        )}
      </Box>
    </Box>
  );
};

export default Passage;
