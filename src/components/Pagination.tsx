import {
  ActionIcon,
  Box,
  Button,
  Group,
  Menu,
  Text,
  UnstyledButton,
} from '@mantine/core';
import {
  IconChevronLeft,
  IconChevronRight,
} from '@tabler/icons-react';
import { useRef } from 'react';
import { pageNumberList } from '../utils/pagination';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: PaginationProps) {
  const currentPageItemRef = useRef<HTMLButtonElement>(null);

  if (totalPages <= 1) return null;

  const pageNumbers = pageNumberList(currentPage, totalPages);
  const allPages = Array.from(
    { length: totalPages },
    (_, i) => i + 1
  );

  return (
    <nav aria-label="Pagination">
      <Group position="center" spacing="xs" mt="md" mb="xl">
      <ActionIcon
        variant="outline"
        size="lg"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        aria-label="Previous page"
      >
        <IconChevronLeft size={18} />
      </ActionIcon>

      {pageNumbers.map((page, index) => {
        if (page === 'ellipsis') {
          return (
            <Menu
              key={`ellipsis-${index}`}
              withinPortal
              position="bottom"
              shadow="md"
              width={120}
            >
              <Menu.Target>
                <UnstyledButton
                  px="xs"
                  aria-label="Show all pages"
                  title="Show all pages"
                >
                  <Text color="dimmed">...</Text>
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown
                onFocus={(event) => {
                  // Mantine's focus trap hands open-focus to
                  // the dropdown wrapper — pass it on to the
                  // current page so it's selected (and
                  // scrolled into view) immediately.
                  if (
                    (event.target as HTMLElement)
                      .hasAttribute('data-menu-dropdown')
                  ) {
                    currentPageItemRef.current?.focus();
                  }
                }}
              >
                <Box sx={{ maxHeight: 320, overflowY: 'auto' }}>
                  {allPages.map((pageNumber) => (
                    <Menu.Item
                      key={pageNumber}
                      ref={
                        pageNumber === currentPage
                          ? currentPageItemRef
                          : undefined
                      }
                      aria-current={
                        pageNumber === currentPage
                          ? 'page'
                          : undefined
                      }
                      onClick={() => {
                        if (pageNumber !== currentPage) {
                          onPageChange(pageNumber);
                        }
                      }}
                    >
                      Page {pageNumber}
                    </Menu.Item>
                  ))}
                </Box>
              </Menu.Dropdown>
            </Menu>
          );
        }

        return (
          <Button
            key={page}
            variant={page === currentPage ? 'filled' : 'outline'}
            size="sm"
            onClick={() => onPageChange(page)}
            aria-label={`Page ${page}`}
            aria-current={
              page === currentPage ? 'page' : undefined
            }
          >
            {page}
          </Button>
        );
      })}

      <ActionIcon
        variant="outline"
        size="lg"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        aria-label="Next page"
      >
        <IconChevronRight size={18} />
      </ActionIcon>
      </Group>
    </nav>
  );
}
