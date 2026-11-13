/**
 * Total number of pages for a paginated list.
 */
export const pageCount = (
  totalItems: number,
  pageSize: number
): number => Math.ceil(totalItems / pageSize);

/** One slot rendered by the Pagination control. */
export type PageItem = number | 'ellipsis';

/**
 * Page items for the Pagination control — explicit page
 * numbers plus 'ellipsis' gaps. Lists of five pages or fewer
 * render in full; longer lists show only the first, current
 * and last page — adjacent-page hops are covered by the
 * previous/next buttons.
 */
export const pageNumberList = (
  currentPage: number,
  totalPages: number
): PageItem[] => {
  if (totalPages <= 5) {
    // Show all pages if 5 or fewer
    return Array.from(
      { length: totalPages },
      (_, i) => i + 1
    );
  }

  const pages: PageItem[] = [1];

  if (currentPage > 2) {
    pages.push('ellipsis');
  }
  if (currentPage !== 1 && currentPage !== totalPages) {
    pages.push(currentPage);
  }
  if (currentPage < totalPages - 1) {
    pages.push('ellipsis');
  }

  pages.push(totalPages);
  return pages;
};
