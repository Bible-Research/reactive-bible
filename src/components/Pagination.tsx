/* eslint-disable react-refresh/only-export-components --
 * getPageNumbers is exported so its windowing rules can be
 * unit-tested as a pure function. */
import { Group, Button, Text, ActionIcon } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

/**
 * Page window for the pagination bar: always the first and last
 * page plus `currentPage ± 1`, with 'ellipsis' markers filling
 * the gaps. Exported so the windowing rules can be tested as a
 * pure function.
 */
export const getPageNumbers = (
  currentPage: number,
  totalPages: number
): (number | 'ellipsis')[] => {
  const pages: (number | 'ellipsis')[] = [];

  if (totalPages <= 5) {
    // Show all pages if 5 or fewer
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i);
    }
  } else {
    // Always show first page
    pages.push(1);

    if (currentPage > 3) {
      // Show ellipsis after first page
      pages.push('ellipsis');
    }

    // Show previous, current, and next pages
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);

    for (let i = start; i <= end; i++) {
      if (!pages.includes(i)) {
        pages.push(i);
      }
    }

    if (currentPage < totalPages - 2) {
      // Show ellipsis before last page
      pages.push('ellipsis');
    }

    // Always show last page
    if (!pages.includes(totalPages)) {
      pages.push(totalPages);
    }
  }

  return pages;
};

export default function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const pageNumbers = getPageNumbers(currentPage, totalPages);

  return (
    <Group position="center" spacing="xs" mt="md" mb="xl">
      <ActionIcon
        variant="outline"
        size="lg"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
      >
        <IconChevronLeft size={18} />
      </ActionIcon>

      {pageNumbers.map((page, index) => {
        if (page === 'ellipsis') {
          return (
            <Text key={`ellipsis-${index}`} color="dimmed" px="xs">
              ...
            </Text>
          );
        }

        return (
          <Button
            key={page}
            variant={page === currentPage ? 'filled' : 'outline'}
            size="sm"
            onClick={() => onPageChange(page)}
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
      >
        <IconChevronRight size={18} />
      </ActionIcon>
    </Group>
  );
}
