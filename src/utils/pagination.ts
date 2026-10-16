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
 * render in full; longer lists always show the first and last
 * page plus the ±1 neighbourhood of the current page.
 */
export const pageNumberList = (
  currentPage: number,
  totalPages: number
): PageItem[] => {
  const pages: PageItem[] = [];

  if (totalPages <= 5) {
    // Show all pages if 5 or fewer
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i);
    }
    return pages;
  }

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

  return pages;
};
