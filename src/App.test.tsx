import React from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, test, expect, beforeEach } from "vitest";
import App from "./App";

beforeEach(() => {
  render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});

describe("check for bible verse", () => {
  test("should contain exodus 2: 18", async () => {
    fireEvent.click(screen.getByTitle("nav-book-Exod"));
    fireEvent.click(screen.getByTitle("nav-chapter-2"));

    // Wait for the verse to appear after async data loading
    await waitFor(
      () => {
        expect(
          screen.getByTitle("passage-verse-18")
        ).toHaveTextContent(
          "And when they came to Reuel their father, he said, How is it that ye are come so soon to day?"
        );
      },
      { timeout: 5000 }
    );
  });

  test("should contain john 11: 35", async () => {
    fireEvent.click(screen.getByTitle("nav-book-John"));
    fireEvent.click(screen.getByTitle("nav-chapter-9"));
    fireEvent.click(screen.getByTitle("next-passage-button"));
    fireEvent.click(screen.getByTitle("next-passage-button"));

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
