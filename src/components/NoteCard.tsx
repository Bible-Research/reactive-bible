import { Card, Title, Text, Button, Group } from "@mantine/core";
import { Note } from "../api";
import Verse from "./Verse";

interface NoteCardProps {
  note: Note;
  onViewInBible: (book: string, chapter: number, verse: number) => void;
}

const NoteCard = ({ note, onViewInBible }: NoteCardProps) => {
  const firstVerse = note.verses[0]?.verse || 1;
  const lastVerse = note.verses[note.verses.length - 1]?.verse || 1;
  const book = note.verses[0]?.book || "";
  const chapter = note.verses[0]?.chapter || 1;

  const heading =
    firstVerse === lastVerse
      ? `${book} ${chapter}:${firstVerse}`
      : `${book} ${chapter}:${firstVerse}-${lastVerse}`;

  return (
    <Card shadow="sm" padding={0} radius="md" mb={15}>
      <Group position="apart" mb={10}>
        <Title order={4}>{heading}</Title>
        <Button
          variant="subtle"
          size="xs"
          onClick={() => onViewInBible(book, chapter, firstVerse)}
        >
          View in Bible
        </Button>
      </Group>

      {note.verses.map((v) => (
        <Verse key={v.verse} verse={v.verse} text={v.text} />
      ))}

      <Text ml={20} mt={10} fs="italic" c="dimmed">
        {note.note_text}
      </Text>
    </Card>
  );
};

export default NoteCard;
