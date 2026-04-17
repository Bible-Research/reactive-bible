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
import * as api from './api';

// Store the cleanup function
beforeEach(() => {
  // Mock API functions
  vi.spyOn(api, 'getBooks').mockResolvedValue([
    { book_name: 'Genesis', book_id: 'Gen' },
    { book_name: 'Exodus', book_id: 'Exo' },
    { book_name: 'John', book_id: 'Jhn' },
  ]);
  vi.spyOn(api, 'getChapters').mockResolvedValue([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  vi.spyOn(api, 'getVerses').mockResolvedValue([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35]);
  vi.spyOn(api, 'getVersesInKjvChapter').mockResolvedValue([
    { verse: 18, text: 'And when they came to Reuel their father, he said, How is it that ye are come so soon to day?' },
    { verse: 35, text: 'Jesus wept.' },
  ]);

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

  render(
    <MemoryRouter initialEntries={['/bible/John/1']}>
      <App />
    </MemoryRouter>
  );
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("check for bible verse", () => {
  // App starts at John 1, navigate to Exodus 2
  test("should contain exodus 2: 18", async () => {
    // fireEvent already wraps in act(), no need for explicit act()
    fireEvent.click(await screen.findByText("Exodus"));
    fireEvent.click(await screen.findByTitle("nav-chapter-2"));

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
    fireEvent.click(await screen.findByTitle("nav-chapter-11"));

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
