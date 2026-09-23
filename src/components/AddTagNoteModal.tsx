import { Box, Divider, Modal, Text } from "@mantine/core";
import { addTagNote, getVersesInChapter } from "../api";
import { useBibleStore } from "../store";
import { useEffect, useMemo, useState } from "react";
import { groupRefsByChapter } from "../utils/verseRefs";
import { toBookName } from "../utils/bibleUtils";
import NoteForm from "./NoteForm";

interface AddTagNoteModalProps {
  opened: boolean;
  onClose: () => void;
}

interface VerseText {
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

const AddTagNoteModal = ({ opened, onClose }: AddTagNoteModalProps) => {
  const {
    tags,
    getTags,
    verseSelection,
    setVerseSelection,
    activeTextFilesetId,
    lastSelectedTagId,
    setLastSelectedTagId,
  } = useBibleStore((state) => ({
    tags: state.tags,
    getTags: state.getTags,
    verseSelection: state.verseSelection,
    setVerseSelection: state.setVerseSelection,
    activeTextFilesetId: state.activeTextFilesetId,
    lastSelectedTagId: state.lastSelectedTagId,
    setLastSelectedTagId: state.setLastSelectedTagId,
  }));

  const refs = useMemo(
    () => verseSelection?.refs ?? [],
    [verseSelection]
  );

  const [verseTexts, setVerseTexts] = useState<VerseText[]>([]);

  useEffect(() => {
    // Only fetch tags when modal opens (not on mount when closed)
    if (opened) {
      getTags();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]); // Only run when opened changes

  useEffect(() => {
    if (!opened || !activeTextFilesetId || refs.length === 0) return;

    let cancelled = false;

    const fetchVerseTexts = async () => {
      try {
        // Selections may span chapters/books — fetch each
        // book/chapter group independently.
        const groups = groupRefsByChapter(refs);
        const results = await Promise.all(
          groups.map(async (group) => {
            const result = await getVersesInChapter(
              group.bookId,
              group.chapter,
              activeTextFilesetId
            );
            const wanted = new Set(group.verses);
            return result.verses
              .filter((v) => wanted.has(v.verse))
              .map((v) => ({
                book: toBookName(group.bookId) ?? group.bookId,
                chapter: group.chapter,
                verse: v.verse,
                text: v.text,
              }));
          })
        );
        if (cancelled) return;
        setVerseTexts(results.flat());
      } catch {
        // Non-critical — verse preview is best-effort
      }
    };

    void fetchVerseTexts();

    return () => {
      cancelled = true;
    };
  }, [opened, refs, activeTextFilesetId]);

  const handleSubmit = async (tagId: string, text: string) => {
    // The notes API expects book names (verses[].book).
    const verseReferences = refs.map(
      ({ bookId, chapter, verse }) => ({
        book: toBookName(bookId) ?? bookId,
        chapter,
        verse,
      })
    );

    try {
      await addTagNote(tagId, text, verseReferences);
      setLastSelectedTagId(tagId || null);
      setVerseSelection(null); // Clear selected verses
      setVerseTexts([]);
      onClose();
    } catch (error) {
      console.error(error);
    }
  };

  const textGroups = useMemo(() => {
    const groups = new Map<string, VerseText[]>();
    for (const v of verseTexts) {
      const key = `${v.book} ${v.chapter}`;
      const group = groups.get(key);
      if (group) {
        group.push(v);
      } else {
        groups.set(key, [v]);
      }
    }
    return [...groups.entries()];
  }, [verseTexts]);

  return (
    <Modal opened={opened} onClose={onClose} title="Add note" fullScreen>
      <NoteForm
        tags={tags}
        onSubmit={handleSubmit}
        submitText="Submit"
        onTagDropdownOpen={() => getTags()}
        note={
          lastSelectedTagId
            ? { tagId: lastSelectedTagId, text: "" }
            : undefined
        }
      />
      {textGroups.map(([label, groupVerses]) => (
        <Box key={label} mt="xl">
          <Divider my="sm" label={label} labelPosition="center" />
          {groupVerses.map((v) => (
            <Box key={v.verse} py={4} px={8}>
              <Text size="sm">
                <Text component="span" weight={700} mr={4}>
                  {v.verse}
                </Text>
                {v.text}
              </Text>
            </Box>
          ))}
        </Box>
      ))}
    </Modal>
  );
};

export default AddTagNoteModal;
