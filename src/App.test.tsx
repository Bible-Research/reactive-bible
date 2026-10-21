import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import App from "./App";
import { useBibleStore } from "./store";

// Store the cleanup function
let cleanup: (() => void) | undefined;

beforeEach(() => {
  // Reset store to John 1 with KJV (tests expect KJV verse text)
  useBibleStore.setState({
    activeBookId: "JHN",
    activeChapter: 1,
    verseSelection: null,
    bibleVersion: "KJV",
    activeTextFilesetId: "ENGKJV",
    activeAudioFilesetId: null,
  });

  // render() already wraps in act(), no need for explicit act()
  const result = render(
    <React.StrictMode>
      <MemoryRouter initialEntries={['/bible/JHN.1']}>
        <App />
      </MemoryRouter>
    </React.StrictMode>
  );
  cleanup = result.unmount;
});

afterEach(() => {
  // cleanup() is already wrapped in act() by RTL
  if (cleanup) {
    cleanup();
  }
  vi.clearAllMocks();
});

describe("check for bible verse", () => {
  // App starts at John 1, navigate to Exodus 2
  test("should contain exodus 2: 18", async () => {
    // fireEvent already wraps in act(), no need for explicit act()
    fireEvent.click(screen.getByTitle("nav-book-EXO"));
    fireEvent.click(screen.getByTitle("nav-chapter-2"));

    // Wait for the verse to appear after async data loading
    await waitFor(
      () => {
        expect(
          screen.getByTitle("passage-verse-2-18")
        ).toHaveTextContent(
          "And when they came to Reuel their father, " +
          "he said, How is it that ye are come so soon to day?"
        );
      },
      // Generous: under fileParallelism the lazy kjv.json
      // chunk competes with ~10 workers for module eval.
      { timeout: 15000 }
    );
  });

  // App starts at John 1, navigate to John 11
  test("should contain john 11: 35", async () => {
    // Already at John, just navigate to chapter 11
    // fireEvent already wraps in act()
    fireEvent.click(screen.getByTitle("nav-chapter-11"));

    // Wait for the verse to appear after async data loading
    await waitFor(
      () => {
        expect(
          screen.getByTitle("passage-verse-11-35")
        ).toHaveTextContent("Jesus wept.");
      },
      { timeout: 15000 }
    );
  });
});

describe('"/" search hotkey', () => {
  const searchInput = () =>
    screen.queryByPlaceholderText(
      'Search for words or phrases...'
    );

  test('navigates to /search on a plain "/" press', async () => {
    fireEvent.keyDown(document.body, { key: '/' });
    await waitFor(() => {
      expect(searchInput()).toBeInTheDocument();
    });
  });

  test('ignores "/" typed inside a contenteditable editor',
    async () => {
      // TipTap renders a contenteditable DIV — "/" there must
      // type into the note, not hijack navigation.
      const editor = document.createElement('div');
      editor.setAttribute('contenteditable', 'true');
      document.body.appendChild(editor);
      try {
        const event = new KeyboardEvent('keydown', {
          key: '/',
          bubbles: true,
          cancelable: true,
        });
        act(() => {
          editor.dispatchEvent(event);
        });
        await act(async () => {
          await new Promise((r) => setTimeout(r, 0));
        });
        expect(event.defaultPrevented).toBe(false);
        expect(searchInput()).toBeNull();
      } finally {
        editor.remove();
      }
    },
  );

  test('ignores "/" on focused select elements', async () => {
    const select = document.createElement('select');
    document.body.appendChild(select);
    try {
      fireEvent.keyDown(select, { key: '/' });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(searchInput()).toBeNull();
    } finally {
      select.remove();
    }
  });

  test('does not re-navigate when already on /search', async () => {
    fireEvent.keyDown(document.body, { key: '/' });
    await waitFor(() => {
      expect(searchInput()).toBeInTheDocument();
    });

    // On /search a "/" press must not be swallowed or push a
    // duplicate history entry — the event stays un-prevented.
    const event = new KeyboardEvent('keydown', {
      key: '/',
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      document.body.dispatchEvent(event);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(event.defaultPrevented).toBe(false);
    expect(searchInput()).toBeInTheDocument();
  });
});
