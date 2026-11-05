import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { describe, it, expect, vi, afterEach } from 'vitest';
import MyHeader from './MyHeader';
import { useBibleStore } from '../store';
import {
  mockDomApis,
  renderWithProviders,
  resetStore,
} from '../__tests__/helpers';

// Creates a fake scroll container attached to the document so the
// header's capture-phase window listener receives its scroll
// events. jsdom reports zero for clientHeight/scrollHeight, so
// they are stubbed when a test needs a scrollable element.
function createScroller(
  { clientHeight = 0, scrollHeight = 0 } = {}
) {
  const el = document.createElement('div');
  let top = 0;
  Object.defineProperty(el, 'scrollTop', {
    get: () => top,
    configurable: true,
  });
  Object.defineProperty(el, 'clientHeight', {
    get: () => clientHeight,
    configurable: true,
  });
  Object.defineProperty(el, 'scrollHeight', {
    get: () => scrollHeight,
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

  it('drives headerVisible in the store so the AppShell can ' +
    'reclaim the reserved space', () => {
    renderHeader();
    const scroller = createScroller();
    scrollers.push(scroller);

    scroller.scrollTo(0);
    scroller.scrollTo(200);
    expect(useBibleStore.getState().headerVisible).toBe(false);

    scroller.scrollTo(0);
    expect(useBibleStore.getState().headerVisible).toBe(true);
  });

  it('reappears when the scroller reaches the bottom (#188)', () => {
    renderHeader();
    const scroller = createScroller({
      clientHeight: 500,
      scrollHeight: 2000,
    });
    scrollers.push(scroller);

    scroller.scrollTo(0);
    scroller.scrollTo(300);
    expect(isVisible()).toBe(false);

    // 1500 + 500 = 2000 = scrollHeight — the very bottom.
    scroller.scrollTo(1500);
    expect(isVisible()).toBe(true);
  });

  it('stays hidden just above the bottom reveal zone (#188)', () => {
    renderHeader();
    const scroller = createScroller({
      clientHeight: 500,
      scrollHeight: 2000,
    });
    scrollers.push(scroller);

    scroller.scrollTo(0);
    scroller.scrollTo(300);
    expect(isVisible()).toBe(false);

    // 1475 + 500 = 1975 < 2000 - 24 — still above the end.
    scroller.scrollTo(1475);
    expect(isVisible()).toBe(false);

    scroller.scrollTo(1500);
    expect(isVisible()).toBe(true);
  });

  it('ignores bottom detection on non-scrollable targets', () => {
    renderHeader();
    const scroller = createScroller();
    scrollers.push(scroller);

    scroller.scrollTo(0);
    scroller.scrollTo(200);
    expect(isVisible()).toBe(false);
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

  describe('route changes', () => {
    // Buttons that drive real router navigations — verse taps
    // replace the URL with /bible/BOOK.CHAPTER.verses, which
    // must not re-show bars a scroll just hid.
    const Nav = () => {
      const navigate = useNavigate();
      return (
        <>
          <button
            title="nav-verses"
            onClick={() => navigate('/bible/LUK.13.3,12,15')}
          />
          <button
            title="nav-deselect"
            onClick={() => navigate('/bible/LUK.13')}
          />
          <button
            title="nav-chapter"
            onClick={() => navigate('/bible/LUK.14')}
          />
        </>
      );
    };

    // renderWithProviders wraps in its own MemoryRouter and
    // nested routers are forbidden — render directly with the
    // initial entry the test needs instead.
    const renderHeaderAt = (path: string) => {
      resetStore();
      mockDomApis();
      return render(
        <MemoryRouter initialEntries={[path]}>
          <MyHeader menuOpened={false} setMenuOpened={vi.fn()} />
          <Nav />
        </MemoryRouter>
      );
    };

    it('stays hidden when verse selection updates the URL ' +
      'inside the same chapter', () => {
      renderHeaderAt('/bible/LUK.13');
      const scroller = createScroller();
      scrollers.push(scroller);

      scroller.scrollTo(0);
      scroller.scrollTo(200);
      expect(isVisible()).toBe(false);

      fireEvent.click(screen.getByTitle('nav-verses'));
      expect(isVisible()).toBe(false);
    });

    it('stays hidden when clearing the selection removes the ' +
      'verse segment from the URL', () => {
      renderHeaderAt('/bible/LUK.13.3,12,15');
      const scroller = createScroller();
      scrollers.push(scroller);

      scroller.scrollTo(0);
      scroller.scrollTo(200);
      expect(isVisible()).toBe(false);

      fireEvent.click(screen.getByTitle('nav-deselect'));
      expect(isVisible()).toBe(false);
    });

    it('reappears on a real navigation to another chapter', () => {
      renderHeaderAt('/bible/LUK.13.3');
      const scroller = createScroller();
      scrollers.push(scroller);

      scroller.scrollTo(0);
      scroller.scrollTo(200);
      expect(isVisible()).toBe(false);

      fireEvent.click(screen.getByTitle('nav-chapter'));
      expect(isVisible()).toBe(true);
    });
  });
});
