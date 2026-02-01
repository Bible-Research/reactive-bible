import { Box } from "@mantine/core";
import SubHeader from "./SubHeader";
import PassageView from "./PassageView";

// NOTE: This component is deprecated in favor of BibleRoute
// It's kept for backward compatibility with existing tests
const Passage = ({ open }: { open?: () => void }) => {
  return (
    <Box style={{ flex: "1 0 100%" }}>
      <SubHeader open={open} />
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
        h="80vh"
      >
        <PassageView />
      </Box>
    </Box>
  );
};

export default Passage;
