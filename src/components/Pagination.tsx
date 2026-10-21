/* eslint-disable react-refresh/only-export-components --
 * getPageNumbers is exported so its windowing rules can be
 * unit-tested as a pure function. */
import { Group, Button, Text, ActionIcon } from '@mantine/core';
import {
  IconChevronLeft,
  IconChevronRight,
} from '@tabler/icons-react';
import { pageNumberList } from '../utils/pagination';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

/**
 * Page window for the pagination bar: always the first and last
 * page plus `currentPage ± 1`, with 'ellipsis' markers filling
 * the gaps. The implementation lives in utils/pagination.ts;
 * this alias keeps the existing component-level import (and its
 * unit tests) working.
 */
export const getPageNumbers = pageNumberList;

export default function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const pageNumbers = pageNumberList(currentPage, totalPages);

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
            <Text
              key={`ellipsis-${index}`}
              color="dimmed"
              px="xs"
              aria-hidden="true"
            >
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
