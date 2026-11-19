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
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  const currentPageItemRef = useRef<HTMLButtonElement>(null);

  if (totalPages <= 1) return null;

  const pageNumbers = pageNumberList(currentPage, totalPages);
  const allPages = Array.from(
    { length: totalPages },
    (_, i) => i + 1
  );

  return (
    <nav aria-label={t('pagination.label')}>
      <Group position="center" spacing="xs" mt="md" mb="xl">
      <ActionIcon
        variant="default"
        size="lg"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        aria-label={t('pagination.previous')}
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
                  aria-label={t('pagination.showAll')}
                  title={t('pagination.showAll')}
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
            variant={page === currentPage ? 'filled' : 'default'}
            size="sm"
            onClick={() => onPageChange(page)}
            aria-label={t('pagination.page', { page })}
            aria-current={
              page === currentPage ? 'page' : undefined
            }
          >
            {page}
          </Button>
        );
      })}

      <ActionIcon
        variant="default"
        size="lg"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        aria-label={t('pagination.next')}
      >
        <IconChevronRight size={18} />
      </ActionIcon>
      </Group>
    </nav>
  );
}
