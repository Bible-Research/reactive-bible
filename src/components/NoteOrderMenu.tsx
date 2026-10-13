import { useMemo, useState } from "react";
import {
  Button,
  Menu,
  ScrollArea,
  Text,
  TextInput,
} from "@mantine/core";
import {
  NoteOrderIndexEntry,
  NoteOrderMenuData,
} from "../types";

interface NoteOrderMenuProps {
  /** The note this badge/menu belongs to. */
  noteId: string;
  /** 1-based order ID displayed on the badge (`#k`). */
  orderId: number;
  data: NoteOrderMenuData;
}

/** `#k — Book C:V[-V]`, or `#k — no passage` for verse-less
 *  notes. `k` is the canonical 1-based order ID. */
const entryLabel = (
  entry: NoteOrderIndexEntry,
  orderId: number | undefined
): string => {
  const idPart = `#${orderId ?? '?'}`;
  if (
    !entry.book ||
    entry.chapter === null ||
    entry.verse_start === null
  ) {
    return `${idPart} — no passage`;
  }
  const range =
    entry.verse_end !== null &&
    entry.verse_end !== entry.verse_start
      ? `${entry.verse_start}-${entry.verse_end}`
      : `${entry.verse_start}`;
  return `${idPart} — ${entry.book} ${entry.chapter}:${range}`;
};

const NoteOrderMenu = ({
  noteId,
  orderId,
  data,
}: NoteOrderMenuProps) => {
  const [filter, setFilter] = useState('');

  // Labels are precomputed once per index refresh so each
  // keystroke only runs a substring check per row — cheap
  // even at the ~2000-note ceiling (js-index-maps).
  const labeledEntries = useMemo(
    () =>
      data.entries.map((entry) => {
        const entryOrderId = data.orderIdByNoteId.get(entry.id);
        return {
          entry,
          orderId: entryOrderId,
          label: entryLabel(entry, entryOrderId),
        };
      }),
    [data.entries, data.orderIdByNoteId]
  );

  const needle = filter.trim().toLowerCase();
  const visibleEntries = useMemo(
    () =>
      needle
        ? labeledEntries.filter((item) =>
            item.label.toLowerCase().includes(needle)
          )
        : labeledEntries,
    [labeledEntries, needle]
  );

  return (
    <Menu withinPortal position="bottom-end" shadow="md" width={280}>
      <Menu.Target>
        <Button
          variant="subtle"
          size="xs"
          compact
          color="gray"
          aria-label={`note-order-${noteId}`}
        >
          #{orderId}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <TextInput
          placeholder="Filter by passage or #id"
          size="xs"
          value={filter}
          onChange={(event) =>
            setFilter(event.currentTarget.value)
          }
          mb="xs"
          aria-label="filter-note-order"
        />
        <Menu.Item
          disabled={orderId === 1}
          onClick={() => data.onMoveToTop(noteId)}
        >
          Move to top
        </Menu.Item>
        <Menu.Divider />
        <ScrollArea mah={320}>
          {visibleEntries.length === 0 ? (
            <Text size="xs" color="dimmed" p="xs">
              No matching notes
            </Text>
          ) : (
            visibleEntries.map(({ entry, label }) => (
              <Menu.Item
                key={entry.id}
                disabled={entry.id === noteId}
                onClick={() => data.onMoveAfter(noteId, entry.id)}
              >
                {label}
              </Menu.Item>
            ))
          )}
        </ScrollArea>
      </Menu.Dropdown>
    </Menu>
  );
};

export default NoteOrderMenu;
