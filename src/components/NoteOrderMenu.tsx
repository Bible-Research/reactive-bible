import { useMemo, useState } from "react";
import {
  Button,
  Menu,
  ScrollArea,
  Text,
  TextInput,
} from "@mantine/core";
import { NoteOrderMenuData } from "../types";

interface NoteOrderMenuProps {
  /** The note this badge/menu belongs to. */
  noteId: string;
  /** 1-based order ID displayed on the badge (`#k`). */
  orderId: number;
  data: NoteOrderMenuData;
}

const NoteOrderMenu = ({
  noteId,
  orderId,
  data,
}: NoteOrderMenuProps) => {
  const [filter, setFilter] = useState('');

  // Labels are precomputed once per index refresh in
  // TagNotesRoute and shared by every mounted menu, so each
  // keystroke only runs a substring check per row — cheap
  // even at the ~2000-note ceiling (js-index-maps).
  const needle = filter.trim().toLowerCase();
  const visibleEntries = useMemo(
    () =>
      needle
        ? data.labeledEntries.filter((item) =>
            item.label.toLowerCase().includes(needle)
          )
        : data.labeledEntries,
    [data.labeledEntries, needle]
  );

  return (
    <Menu
      withinPortal
      position="bottom-end"
      shadow="md"
      width={280}
      onClose={() => setFilter('')}
    >
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
          disabled={orderId === data.topOrderId}
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
