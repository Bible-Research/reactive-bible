import { useNavigate } from "react-router-dom";
import { Box } from "@mantine/core";
import NotesView from "../components/NotesView";
import SubHeader from "../components/SubHeader";

export default function NotesListRoute() {
  const navigate = useNavigate();

  const handleViewInBible = (
    book: string,
    chapter: number,
    verse: number
  ) => {
    navigate(`/bible/${book}/${chapter}/${verse}`);
  };

  return (
    <Box style={{ flex: "1 0 100%" }}>
      <SubHeader />
      <NotesView onViewInBible={handleViewInBible} />
    </Box>
  );
}
