import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Pagination, { getPageNumbers } from '../Pagination';
import { mockDomApis } from '../../__tests__/helpers';

describe('getPageNumbers', () => {
  it('returns every page when totalPages <= 5', () => {
    expect(getPageNumbers(1, 1)).toEqual([1]);
    expect(getPageNumbers(3, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('windows around the first page without a leading ' +
    'ellipsis', () => {
      expect(getPageNumbers(1, 10)).toEqual([
        1,
        2,
        'ellipsis',
        10,
      ]);
      expect(getPageNumbers(3, 10)).toEqual([
        1,
        2,
        3,
        4,
        'ellipsis',
        10,
      ]);
    });

  it('bookends a middle page with both ellipses', () => {
    expect(getPageNumbers(5, 10)).toEqual([
      1,
      'ellipsis',
      4,
      5,
      6,
      'ellipsis',
      10,
    ]);
  });

  it('windows around the last page without a trailing ' +
    'ellipsis', () => {
      expect(getPageNumbers(10, 10)).toEqual([
        1,
        'ellipsis',
        9,
        10,
      ]);
      expect(getPageNumbers(8, 10)).toEqual([
        1,
        'ellipsis',
        7,
        8,
        9,
        10,
      ]);
    });

  it('never duplicates or skips the first/last page', () => {
    const pages = getPageNumbers(4, 6);
    expect(pages[0]).toBe(1);
    expect(pages[pages.length - 1]).toBe(6);
    expect(
      pages.filter((p) => p === 4)
    ).toHaveLength(1);
  });
});

describe('Pagination component', () => {
  it('renders nothing for a single page', () => {
    mockDomApis();
    const { container } = render(
      <Pagination
        currentPage={1}
        totalPages={1}
        onPageChange={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('calls onPageChange when a page button is clicked', () => {
    mockDomApis();
    const onPageChange = vi.fn();
    render(
      <Pagination
        currentPage={2}
        totalPages={5}
        onPageChange={onPageChange}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Page 4' })
    );
    expect(onPageChange).toHaveBeenCalledWith(4);
  });

  it('disables previous/next at the bounds', () => {
    mockDomApis();
    const { container, unmount } = render(
      <Pagination
        currentPage={1}
        totalPages={5}
        onPageChange={vi.fn()}
      />
    );
    const icons = container.querySelectorAll('button');
    expect(icons[0]).toBeDisabled(); // previous
    expect(icons[icons.length - 1]).not.toBeDisabled();

    unmount();
    const { container: last } = render(
      <Pagination
        currentPage={5}
        totalPages={5}
        onPageChange={vi.fn()}
      />
    );
    const lastIcons = last.querySelectorAll('button');
    expect(
      lastIcons[lastIcons.length - 1]
    ).toBeDisabled(); // next
  });

  it('renders ellipsis markers for large page counts', () => {
    mockDomApis();
    render(
      <Pagination
        currentPage={5}
        totalPages={10}
        onPageChange={vi.fn()}
      />
    );

    expect(screen.getAllByText('...')).toHaveLength(2);
    expect(
      screen.getByRole('button', { name: 'Page 10' })
    ).toBeInTheDocument();
  });
});
