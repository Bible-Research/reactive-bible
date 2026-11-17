import {
  render,
  screen,
  act,
  within,
  fireEvent,
} from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, it, expect, vi, afterEach } from 'vitest';
import BottomNav from './BottomNav';
import { AUDIO_PLAYER_HEIGHT } from '../utils/audioUtils';
import { useBibleStore } from '../store';
import {
  mockDomApis,
  renderWithProviders,
} from '../__tests__/helpers';

const renderNav = (selectorOpened = false) =>
  renderWithProviders(
    <BottomNav
      bibleSelectorOpened={selectorOpened}
      setBibleSelectorOpened={vi.fn()}
    />
  );

const getFooter = () => screen.getByRole('contentinfo');
const isVisible = () =>
  getFooter().getAttribute('data-bottom-nav-visible') === 'true';

// The marquee outer span carries `title={name}` for its
// clipped-name tooltip — also the test handle.
const nameEl = () => screen.getByTitle('John');
const titleEl = () => screen.getByTitle('nav-current-passage');

describe('BottomNav', () => {
  it('is visible initially', () => {
    renderNav();
    expect(isVisible()).toBe(true);
  });

  it('slides off-screen when headerVisible flips to false ' +
    '(same flag MyHeader drives on scroll)', () => {
    renderNav();

    act(() => {
      useBibleStore.getState().setHeaderVisible(false);
    });
    expect(isVisible()).toBe(false);

    act(() => {
      useBibleStore.getState().setHeaderVisible(true);
    });
    expect(isVisible()).toBe(true);
  });

  it('sits above the fixed audio player while ' +
    'visible and still slides fully off-screen when hidden',
  () => {
    renderWithProviders(
      <BottomNav
        bibleSelectorOpened={false}
        setBibleSelectorOpened={vi.fn()}
      />,
      { stores: { bible: { showAudioPlayer: true } } }
    );

    expect(getComputedStyle(getFooter()).bottom)
      .toBe(`${AUDIO_PLAYER_HEIGHT}px`);

    act(() => {
      useBibleStore.getState().setHeaderVisible(false);
    });
    expect(getComputedStyle(getFooter()).bottom).toBe('-56px');
  });
});

describe('BottomNav passage button toggles the selector', () => {
  // Proves a press never navigates: useNavigate would update
  // this probe, while window.location sits outside the
  // MemoryRouter and is meaningless here.
  const LocationProbe = () => {
    const { pathname } = useLocation();
    return <div data-testid="location">{pathname}</div>;
  };

  const pressPassage = () =>
    fireEvent.click(
      within(screen.getByTitle('nav-current-passage'))
        .getByRole('button')
    );

  it('opens the selector when it is closed', () => {
    const setOpened = vi.fn();
    renderWithProviders(
      <BottomNav
        bibleSelectorOpened={false}
        setBibleSelectorOpened={setOpened}
      />
    );

    expect(
      within(screen.getByTitle('nav-current-passage'))
        .getByRole('button')
    ).toHaveAttribute('aria-expanded', 'false');

    pressPassage();
    expect(setOpened).toHaveBeenCalledTimes(1);
    expect(setOpened).toHaveBeenCalledWith(true);
  });

  it('closes the selector without navigating when it ' +
    'is already open', () => {
    const setOpened = vi.fn();
    renderWithProviders(
      <>
        <LocationProbe />
        <BottomNav
          bibleSelectorOpened={true}
          setBibleSelectorOpened={setOpened}
        />
      </>
    );

    expect(
      within(screen.getByTitle('nav-current-passage'))
        .getByRole('button')
    ).toHaveAttribute('aria-expanded', 'true');

    pressPassage();
    expect(setOpened).toHaveBeenCalledTimes(1);
    expect(setOpened).toHaveBeenCalledWith(false);
    expect(screen.getByTestId('location').textContent).toBe('/');
  });

  it('toggles open then closed across renders', () => {
    const setOpened = vi.fn();
    const { rerender } = renderWithProviders(
      <BottomNav
        bibleSelectorOpened={false}
        setBibleSelectorOpened={setOpened}
      />
    );

    pressPassage();
    expect(setOpened).toHaveBeenLastCalledWith(true);

    rerender(
      <BottomNav
        bibleSelectorOpened={true}
        setBibleSelectorOpened={setOpened}
      />
    );
    pressPassage();
    expect(setOpened).toHaveBeenLastCalledWith(false);
    expect(setOpened).toHaveBeenCalledTimes(2);
  });
});

/**
 * Pins the element widths the marquee measure depends on —
 * happy-dom reports 0 for layout metrics. Restored after
 * each test since the override lives on the prototype.
 */
const scrollWidthDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'scrollWidth'
);
const clientWidthDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'clientWidth'
);

const mockWidths = (scrollWidth: number, clientWidth: number) => {
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
    configurable: true,
    get: () => scrollWidth,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => clientWidth,
  });
};

const restoreWidths = () => {
  for (const [prop, descriptor] of [
    ['scrollWidth', scrollWidthDescriptor],
    ['clientWidth', clientWidthDescriptor],
  ] as const) {
    if (descriptor) {
      Object.defineProperty(
        HTMLElement.prototype,
        prop,
        descriptor
      );
    } else {
      // happy-dom may not define these at all — remove our
      // added prototype accessor entirely.
      delete (HTMLElement.prototype as never)[prop];
    }
  }
};

describe('BottomNav two-zone title + marquee', () => {
  afterEach(restoreWidths);

  // happy-dom expands `flex: none` to its longhand form —
  // either serialization proves the chapter cannot grow,
  // shrink, or scroll away.
  const expectPinned = (el: HTMLElement) =>
    expect(['none', '0 0 auto']).toContain(el.style.flex);

  it('renders the book name and a pinned chapter as ' +
    'separate zones', () => {
    renderNav();

    // The #95 regression contract — textContent stays
    // "John 1" across the two-zone split.
    expect(titleEl().textContent).toBe('John 1');
    expectPinned(within(titleEl()).getByText('1'));
  });

  it('scrolls the name only when it overflows', () => {
    mockWidths(600, 100);
    renderNav();

    const name = nameEl();
    expect(name).toHaveAttribute('data-marquee', 'true');
    const inner = name.lastElementChild as HTMLElement;
    expect(inner.style.animation)
      .toContain('bible-title-marquee');
    expect(inner.style.animation).toContain('infinite');
    // The keyframes travel the full measured overflow so the
    // whole name is revealed before the hold.
    expect(name.querySelector('style')?.textContent)
      .toContain('translateX(-500px)');
    // The chapter stays pinned while the name scrolls.
    expectPinned(within(titleEl()).getByText('1'));
  });

  it('never animates a name that fits', () => {
    mockWidths(100, 100);
    renderNav();

    expect(nameEl()).not.toHaveAttribute('data-marquee');
  });

  it('clips instead of scrolling when bookTitleMarquee ' +
    'is off', () => {
    mockWidths(600, 100);
    renderWithProviders(
      <BottomNav
        bibleSelectorOpened={false}
        setBibleSelectorOpened={vi.fn()}
      />,
      { stores: { bible: { bookTitleMarquee: false } } }
    );

    const name = nameEl();
    expect(name).not.toHaveAttribute('data-marquee');
    // Disabled state = clipped name, chapter still pinned.
    expect(
      (name.firstElementChild as HTMLElement).style
        .textOverflow
    ).toBe('ellipsis');
    expectPinned(within(titleEl()).getByText('1'));
  });

  it('clips instead of scrolling under ' +
    'prefers-reduced-motion', () => {
    mockWidths(600, 100);
    // renderWithProviders' mockDomApis resets matchMedia to
    // matches:false — so mock the APIs here, then override
    // matchMedia to report reduced motion BEFORE render.
    mockDomApis();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    useBibleStore.setState({
      activeBookId: 'JHN',
      activeChapter: 1,
      bookTitleMarquee: true,
      headerVisible: true,
      showAudioPlayer: false,
    });
    render(
      <MemoryRouter>
        <BottomNav
          bibleSelectorOpened={false}
          setBibleSelectorOpened={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(nameEl()).not.toHaveAttribute('data-marquee');
    expectPinned(within(titleEl()).getByText('1'));
  });
});
