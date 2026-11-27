/**
 * Regression: in production Chrome logged
 *   "Blocked aria-hidden on an element because its descendant
 *    retained focus"
 * with `section.mantine-Drawer-content` as the focused element.
 * Mantine v6's focus-trap hider (useFocusTrap ->
 * createAriaHider) marks every `body > :not(script)` sibling
 * aria-hidden except the one holding the overlay — and it did
 * so synchronously, while focus still sat inside a subtree it
 * was hiding (the MainMenu drawer, when a modal opened on top
 * of it). The @mantine/hooks patch (patches/, via
 * patch-package) defers the hiding until the trap's own
 * setTimeout(0) focus move has landed inside the overlay, with
 * a blur fallback; MainMenu also closes the drawer instead of
 * stacking a second trapped overlay on it, and stops the
 * drawer from returning focus into the hidden app root.
 *
 * `violations` records the exact condition Chrome warns on:
 * aria-hidden="true" applied to an ancestor of the focused
 * element.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Drawer, Modal } from '@mantine/core';
import { MemoryRouter } from 'react-router-dom';
import MainMenu from './MainMenu';
import { useBibleStore, initialState } from '../store';
import {
  useAuthStore,
  initialState as authInitialState,
} from '../stores/authStore';

vi.mock('./AddStandaloneNoteModal', () => ({
  default: () => <div data-testid="new-note-modal" />,
}));
vi.mock('./ContactModal', () => ({
  default: () => <div data-testid="contact-modal" />,
}));

const noop = () => {
  /* noop */
};

// Mantine overlay open/close work is timer-driven: the trap
// focuses on setTimeout(0) and the patched hider applies on a
// nested timeout behind it.
const settle = () =>
  act(() => new Promise((resolve) => setTimeout(resolve, 100)));

let violations: string[];
let setAttributeSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  violations = [];
  const original = Element.prototype.setAttribute;
  setAttributeSpy = vi
    .spyOn(Element.prototype, 'setAttribute')
    .mockImplementation(function (this: Element, name, value) {
      if (
        name === 'aria-hidden' &&
        value === 'true' &&
        document.activeElement instanceof Element &&
        document.activeElement !== document.body &&
        this.contains(document.activeElement)
      ) {
        violations.push(this.outerHTML.slice(0, 120));
      }
      return original.call(this, name, value);
    });
});

afterEach(() => {
  setAttributeSpy.mockRestore();
  useBibleStore.setState(initialState);
  useAuthStore.setState(authInitialState);
});

describe('focus-trap aria-hidden regression', () => {
  it('hides siblings without hiding the focused element', async () => {
    render(
      <button data-testid="page-button">page</button>
    );
    screen.getByTestId('page-button').focus();

    render(
      <Modal opened onClose={noop}>
        <button>inside modal</button>
      </Modal>
    );
    await settle();

    expect(violations).toEqual([]);
    expect(document.activeElement).not.toBe(
      screen.getByTestId('page-button')
    );
  });

  it('keeps the modal-open-over-drawer stack warning-free',
    async () => {
      render(
        <>
          <Drawer opened onClose={noop}>
            <button>menu item</button>
          </Drawer>
        </>
      );
      await settle();
      // The trap moved focus inside the drawer — the exact
      // state production was in when the warning fired.
      const drawer = document.querySelector(
        '.mantine-Drawer-content'
      );
      expect(drawer?.contains(document.activeElement)).toBe(true);

      render(
        <Modal opened onClose={noop}>
          <button>inside modal</button>
        </Modal>
      );
      await settle();

      expect(violations).toEqual([]);
      const modal = document.querySelector(
        '.mantine-Modal-content'
      );
      expect(modal?.contains(document.activeElement)).toBe(true);
      // The drawer's own portal root is hidden while the modal
      // is on top — just never while it held focus.
      expect(
        drawer?.closest('[aria-hidden="true"]')
      ).not.toBeNull();
    });

  it('never hides an overlay mounted inside the ' +
    'deferral window', async () => {
      // The hider snapshots its sibling set synchronously at
      // creation — a second overlay mounting before the
      // deferred apply runs must not join the first hider's
      // hidden set: its own hider skips the portal holding
      // its container, so it could never be un-hidden.
      render(
        <Modal opened onClose={noop}>
          <button>first</button>
        </Modal>
      );
      render(
        <Modal opened onClose={noop}>
          <button data-testid="second">second</button>
        </Modal>
      );
      await settle();

      expect(
        screen.getByTestId('second').closest(
          '[aria-hidden="true"]'
        )
      ).toBeNull();
      // The stacked-on modal still hides the first one's
      // portal — top overlay wins, as upstream.
      expect(
        screen.getByText('first').closest(
          '[aria-hidden="true"]'
        )
      ).not.toBeNull();
    });

  it('restores aria-hidden on the siblings after close',
    async () => {
      const { rerender, container } = render(
        <div>page</div>
      );
      rerender(
        <>
          <div>page</div>
          <Modal opened onClose={noop}>
            <button>inside modal</button>
          </Modal>
        </>
      );
      await settle();
      expect(container).toHaveAttribute('aria-hidden', 'true');

      rerender(<div>page</div>);
      await settle();
      expect(container).not.toHaveAttribute('aria-hidden');
    });
});

describe('MainMenu modal launches', () => {
  const renderMenu = (onClose = vi.fn()) => {
    render(
      <MemoryRouter>
        <MainMenu
          opened
          onClose={onClose}
          colorScheme="light"
          toggleColorScheme={noop}
        />
      </MemoryRouter>
    );
    return onClose;
  };

  it('closes the drawer when Contact Developer opens a modal',
    async () => {
      const onClose = renderMenu();
      const user = userEvent.setup();

      await user.click(screen.getByText('Contact developer'));

      expect(onClose).toHaveBeenCalled();
      expect(
        await screen.findByTestId('contact-modal')
      ).toBeInTheDocument();
    });

  it('closes the drawer when New Note opens a modal', async () => {
    useAuthStore.setState({
      token: 'test-token',
      user: { username: 'testuser' },
      isAuthenticated: true,
    });
    const onClose = renderMenu();
    const user = userEvent.setup();

    await user.click(screen.getByText('New Note'));

    expect(onClose).toHaveBeenCalled();
    expect(
      await screen.findByTestId('new-note-modal')
    ).toBeInTheDocument();
  });
});
