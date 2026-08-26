import React from "react";
import {
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
    activeBook: "John",
    activeBookShort: "Joh",
    activeChapter: 1,
    activeVerses: [],
    bibleVersion: "KJV",
    activeTextFilesetId: "ENGKJV",
    activeAudioFilesetId: null,
  });

  // render() already wraps in act(), no need for explicit act()
  const result = render(
    <React.StrictMode>
      <MemoryRouter initialEntries={['/bible/John/1']}>
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
          screen.getByTitle("passage-verse-18")
        ).toHaveTextContent(
          "And when they came to Reuel their father, " +
          "he said, How is it that ye are come so soon to day?"
        );
      },
      { timeout: 5000 }
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
          screen.getByTitle("passage-verse-35")
        ).toHaveTextContent("Jesus wept.");
      },
      { timeout: 5000 }
    );
  });
});
