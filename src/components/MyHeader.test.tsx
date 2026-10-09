import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import MyHeader from './MyHeader';
import { renderWithProviders } from '../__tests__/helpers';

// Creates a fake scroll container attached to the document so the
// header's capture-phase window listener receives its scroll events.
function createScroller() {
  const el = document.createElement('div');
  let top = 0;
  Object.defineProperty(el, 'scrollTop', {
    get: () => top,
    configurable: true,
  });
  document.body.appendChild(el);
  return {
    el,
    scrollTo(value: number) {
      top = value;
      fireEvent.scroll(el);
    },
    destroy() {
      el.remove();
    },
  };
}

const scrollers: ReturnType<typeof createScroller>[] = [];

afterEach(() => {
  scrollers.forEach((s) => s.destroy());
  scrollers.length = 0;
});

function renderHeader() {
  return renderWithProviders(
    <MyHeader menuOpened={false} setMenuOpened={vi.fn()} />
  );
}

const getHeader = () => screen.getByRole('banner');
const isVisible = () =>
  getHeader().getAttribute('data-header-visible') === 'true';

describe('MyHeader', () => {
  it('is visible initially', () => {
    renderHeader();
    expect(isVisible()).toBe(true);
  });

  it('hides after a deliberate downward scroll on an inner ' +
    'container', () => {
    renderHeader();
    const scroller = createScroller();
    scrollers.push(scroller);

    // First event only establishes the baseline for the new
    // scroll target.
    scroller.scrollTo(0);
    scroller.scrollTo(200);

    expect(isVisible()).toBe(false);
  });

  it('stays visible on small downward scrolls', () => {
    renderHeader();
    const scroller = createScroller();
    scrollers.push(scroller);

    scroller.scrollTo(0);
    scroller.scrollTo(60);
    scroller.scrollTo(120);

    expect(isVisible()).toBe(true);
  });

  it('reappears after a deliberate upward scroll', () => {
    renderHeader();
    const scroller = createScroller();
    scrollers.push(scroller);

    scroller.scrollTo(0);
    scroller.scrollTo(300);
    expect(isVisible()).toBe(false);

    scroller.scrollTo(100);
    expect(isVisible()).toBe(true);
  });

  it('stays hidden until the upward scroll delta accumulates', () => {
    renderHeader();
    const scroller = createScroller();
    scrollers.push(scroller);

    scroller.scrollTo(0);
    scroller.scrollTo(300);
    expect(isVisible()).toBe(false);

    // Less than SHOW_SCROLL_DELTA in total: still hidden.
    scroller.scrollTo(250);
    scroller.scrollTo(200);
    expect(isVisible()).toBe(false);

    // Pushing the accumulated upward delta past the threshold.
    scroller.scrollTo(30);
    expect(isVisible()).toBe(true);
  });

  it('resets the accumulated delta when direction changes', () => {
    renderHeader();
    const scroller = createScroller();
    scrollers.push(scroller);

    scroller.scrollTo(0);
    scroller.scrollTo(140); // down = 140
    scroller.scrollTo(130); // up = 10, down reset to 0
    scroller.scrollTo(150); // down = 20 — below the threshold

    expect(isVisible()).toBe(true);
  });
});
