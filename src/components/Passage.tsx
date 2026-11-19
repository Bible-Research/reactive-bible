
import { Box } from "@mantine/core";
import { useBibleStore } from "../store";
import { AUDIO_PLAYER_HEIGHT } from "../utils/audioUtils";
import {
  FOOTER_HEIGHT,
  HEADER_HEIGHT,
} from "../utils/layoutChrome";
import PassageView from "./PassageView";
import NotesView from "./NotesView";

const Passage = () => {
  // Get showNotes from store instead of props
  const showNotes = useBibleStore((state) => state.showNotes);
  const showAudioPlayer = useBibleStore(
    (state) => state.showAudioPlayer
  );

  return (
    <Box style={{ flex: "1 0 100%", height: "100%" }}>
      <Box style={{ height: "100%", overflow: "auto" }}>
        {showNotes ? (
          // NotesView sits outside PassageView's padded scroll
          // area — give it the same clearance for the overlay
          // header/footer chrome and the fixed player bar.
          <Box
            pt={HEADER_HEIGHT}
            pb={
              FOOTER_HEIGHT +
              (showAudioPlayer ? AUDIO_PLAYER_HEIGHT : 0)
            }
          >
            <NotesView />
          </Box>
        ) : (
          <PassageView />
        )}
      </Box>
    </Box>
  );
};

export default Passage;
