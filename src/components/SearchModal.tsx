import { forwardRef, useEffect, useState } from "react";
import { IconSearch } from "@tabler/icons-react";
import {
  Text,
  Group,
  rem,
  Modal,
  useMantineTheme,
  Autocomplete,
  Box,
  SelectItemProps,
} from "@mantine/core";
import { useBibleStore } from "../store";
import { KjvBook } from '../api';
import { loadKjvData } from "../utils/kjvDataLoader";

interface ItemProps extends SelectItemProps {
  chapter: number;
  verse: number;
  text: string;
  book_id: string;
  book_name: string;
}

const AutoCompleteItem = forwardRef<HTMLDivElement, ItemProps>(
  ({ chapter, verse, book_id, value, ...others }: ItemProps, ref) => (
    <div ref={ref} {...others}>
      <Group noWrap>
        <Box>
          <Text>{value}</Text>
          <Text size="xs" color="dimmed" sx={{ lineHeight: 1 }}>
            {book_id + " " + chapter + ":" + verse}
          </Text>
        </Box>
      </Group>
    </div>
  )
);

export function SearchModal({
  opened,
  close,
}: {
  opened: boolean;
  close: () => void;
}) {
  const theme = useMantineTheme();
  const setActiveBook = useBibleStore((state) => state.setActiveBook);
  const setActiveBookShort = useBibleStore((state) => state.setActiveBookShort);
  const setActiveChapter = useBibleStore((state) => state.setActiveChapter);
  const setActiveVerses = useBibleStore((state) => state.setActiveVerses);
  const [searchData, setSearchData] = useState<(ItemProps & { value: string })[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (opened && searchData.length === 0) {
      setLoading(true);
      loadKjvData().then((kjvData) => {
        const mappedData = kjvData.map((book: KjvBook) => ({ ...book, value: book.text, label: book.text }));
        setSearchData(mappedData);
        setLoading(false);
      }).catch(() => {
        setLoading(false);
        // Handle error appropriately
      });
    }
  }, [opened, searchData.length]);

  return (
    <Modal
      opened={opened}
      onClose={close}
      overlayProps={{
        color:
          theme.colorScheme === "dark"
            ? theme.colors.dark[9]
            : theme.colors.gray[2],
        opacity: 0.55,
        blur: 3,
      }}
      withCloseButton={false}
      size="xl"
      styles={{ body: { minHeight: "435px" } }}
    >
      <Autocomplete
        icon={<IconSearch size={rem(16)} />}
        itemComponent={AutoCompleteItem}
        placeholder={loading ? "Loading search data..." : "Search Bible"}
        data={searchData}
        disabled={loading}
        transitionProps={{
          transition: "pop-top-left",
          duration: 80,
          timingFunction: "ease",
        }}
        limit={7}
        onItemSubmit={(item) => {
          setActiveBook(item.book_name);
          setActiveBookShort(item.book_id);
          setActiveChapter(item.chapter);
          setActiveVerses([item.verse]);
          close();
        }}
      />
    </Modal>
  );
}
