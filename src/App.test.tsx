import React from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  act,
} from "@testing-library/react";
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import App from "./App";
import { useBibleStore } from "./store";

// Store the cleanup function
let cleanup: (() => void) | undefined;

beforeEach(async () => {
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

  // Render inside act to handle initial state updates
  await act(async () => {
    const result = render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    cleanup = result.unmount;
  });
});

afterEach(async () => {
  // Clean up and wait for any pending updates
  if (cleanup) {
    await act(async () => {
      cleanup!();
    });
  }
  vi.clearAllMocks();
});

describe("check for bible verse", () => {
  // App starts at John 1, navigate to Exodus 2
  test("should contain exodus 2: 18", async () => {
    await act(async () => {
      fireEvent.click(screen.getByTitle("nav-book-Exod"));
    });

    await act(async () => {
      fireEvent.click(screen.getByTitle("nav-chapter-2"));
    });

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
    await act(async () => {
      fireEvent.click(screen.getByTitle("nav-chapter-11"));
    });

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
