
import { Box } from "@mantine/core";
import { useBibleStore } from "../store";
import { AUDIO_PLAYER_HEIGHT } from "../utils/audioUtils";
import PassageView from "./PassageView";
import NotesView from "./NotesView";

const Passage = () => {
  // Get showNotes from store instead of props
  const showNotes = useBibleStore((state) => state.showNotes);
  const showAudioPlayer = useBibleStore(
    (state) => state.showAudioPlayer
  );
  const headerVisible = useBibleStore(
    (state) => state.headerVisible
  );

  return (
    <Box style={{ flex: "1 0 100%", height: "100%" }}>
      {/* Shared clearance for the fixed player bar so both the
          verse and notes views rest above it — only while the
          footer is up, since App's main padding already clears
          the player once the chrome has slid away. */}
      <Box
        style={{
          height: "100%",
          overflow: "auto",
          paddingBottom:
            showAudioPlayer && headerVisible
              ? AUDIO_PLAYER_HEIGHT
              : 0,
        }}
      >
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
