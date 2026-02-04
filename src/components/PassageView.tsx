import React, { useState, useEffect, useMemo } from "react";
import { ScrollArea, Center, Loader, Box, Menu, Badge } from "@mantine/core";
import { useNavigate } from "react-router-dom";
import { useBibleStore } from "../store";
import { Note } from "../types";
import { NoteVerse } from "../api";
import {
  getVersesInChapter,
  prefetchAudioUrl,
  prefetchAdjacentChapters,
} from "../api";
import Verse from "./Verse";
import { shallow } from 'zustand/shallow';
import { IconPencilPlus } from "@tabler/icons-react";

const PassageView = () => {
  const {
    activeBook,
    activeChapter,
    activeTextFilesetId,
    activeAudioFilesetId,
    showAudioPlayer,
    allNotes,
  } = useBibleStore(
    (state) => ({
      activeBook: state.activeBook,
      activeChapter: state.activeChapter,
      activeTextFilesetId: state.activeTextFilesetId,
      activeAudioFilesetId: state.activeAudioFilesetId,
      showAudioPlayer: state.showAudioPlayer,
      allNotes: state.allNotes,
    }),
    shallow
  );
  const [verses, setVerses] = useState<{ verse: number; text: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const notesByVerse = useMemo(() => {
    const map = new Map<number, number>();
    allNotes.forEach((note: Note) => {
      note.verses.forEach((v: NoteVerse) => {
        if (v.book === activeBook && v.chapter === activeChapter) {
          map.set(v.verse, (map.get(v.verse) || 0) + 1);
        }
      });
    });
    return map;
  }, [allNotes, activeBook, activeChapter]);

  useEffect(() => {
    if (!activeTextFilesetId) return;

    setLoading(true);
    getVersesInChapter(activeBook, activeChapter, activeTextFilesetId)
      .then((result) => {
        setVerses(result);
        setLoading(false);

        // Prefetch current chapter audio (parallel)
        prefetchAudioUrl(activeBook, activeChapter, activeAudioFilesetId);

        // Prefetch next chapter audio (parallel)
        prefetchAudioUrl(activeBook, activeChapter + 1, activeAudioFilesetId);

        // Prefetch adjacent chapters (parallel)
        prefetchAdjacentChapters(
          activeBook,
          activeChapter,
          activeTextFilesetId
        );
      })
      .catch((error) => {
        console.error(error);
        setLoading(false);
      });
  }, [activeBook, activeChapter, activeTextFilesetId, activeAudioFilesetId]);

  if (loading) {
    return (
      <Center h="80vh">
        <Loader size="lg" />
      </Center>
    );
  }

  return (
    <ScrollArea h="80vh">
      <Box pb={showAudioPlayer ? 120 : 0}>
        {verses.map((verse) => {
          const noteCount = notesByVerse.get(verse.verse);
          const [menuOpened, setMenuOpened] = useState(false);

          const handleContextMenu = (e: React.MouseEvent) => {
            e.preventDefault();
            setMenuOpened(true);
          };

          return (
            <Menu
              key={verse.verse}
              shadow="md"
              width={200}
              opened={menuOpened}
              onChange={setMenuOpened}
              position="bottom-start"
            >
              <Menu.Target>
                <Box
                  style={{ position: 'relative', cursor: 'context-menu' }}
                  onContextMenu={handleContextMenu}
                >
                  <Verse verse={verse.verse} text={verse.text} />
                  {noteCount && (
                    <Badge
                      color="blue"
                      size="xs"
                      variant="filled"
                      style={{
                        position: 'absolute',
                        top: 8,
                        left: -8,
                        zIndex: 1,
                      }}
                    >
                      {noteCount}
                    </Badge>
                  )}
                </Box>
              </Menu.Target>

              <Menu.Dropdown>
                <Menu.Label>Verse {verse.verse}</Menu.Label>
                <Menu.Item
                  icon={<IconPencilPlus size={14} />}
                  onClick={() =>
                    navigate(
                      `/notes/new?book=${activeBook}&chapter=${activeChapter}&verse=${verse.verse}`
                    )
                  }
                >
                  Add Note
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          );
        })}
      </Box>
    </ScrollArea>
  );
};

export default React.memo(PassageView);
