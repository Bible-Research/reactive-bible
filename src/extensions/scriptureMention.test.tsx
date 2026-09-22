// @vitest-environment jsdom
import { createRef } from 'react';
import {
  describe,
  it,
  expect,
  afterEach,
  beforeAll,
  vi,
} from 'vitest';
import type { Editor } from '@tiptap/core';
import {
  waitFor,
  fireEvent,
  cleanup,
} from '@testing-library/react';
import RichTextEditor from '../components/RichTextEditor';
import type { RichTextEditorHandle } from '../components/RichTextEditor';
import { renderWithProviders } from '../__tests__/helpers';

// Mantine components in the popup need these jsdom globals.
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
  global.ResizeObserver = class {
    observe() {
      /* noop */
    }
    unobserve() {
      /* noop */
    }
    disconnect() {
      /* noop */
    }
  };
});

let editor: Editor | null = null;

const renderEditor = async () => {
  const ref = createRef<RichTextEditorHandle>();
  renderWithProviders(
    <RichTextEditor
      ref={ref}
      variant="comment"
      value=""
      onChange={vi.fn()}
    />
  );
  await waitFor(() => expect(ref.current?.editor).toBeTruthy());
  editor = ref.current?.editor ?? null;
};

const popupOpen = () =>
  !!document.querySelector('[title^="mention-book-"]');

const pressKey = (key: string): boolean => {
  if (!editor) return false;
  const view = editor.view;
  return !!view.someProp('handleKeyDown', (fn) =>
    fn(view, new KeyboardEvent('keydown', { key }))
  );
};

describe('ScriptureMention suggestion', () => {
  afterEach(() => {
    editor?.destroy();
    editor = null;
    cleanup();
    document.body.innerHTML = '';
  });

  it('opens the picker when @ is typed', async () => {
    await renderEditor();
    editor?.commands.insertContent('@JHN');
    await waitFor(() => expect(popupOpen()).toBe(true));
    expect(
      document.querySelector('[title="mention-book-JHN"]')
    ).toBeTruthy();
  });

  it('inserts a canonical token on Enter when complete', async () => {
    await renderEditor();
    editor?.commands.insertContent('@JHN.3.16');
    await waitFor(() => expect(popupOpen()).toBe(true));

    expect(pressKey('Enter')).toBe(true);
    expect(editor?.getText()).toBe('@JHN.3.16 ');
    await waitFor(() => expect(popupOpen()).toBe(false));
  });

  it('lets Enter pass through for incomplete refs', async () => {
    await renderEditor();
    editor?.commands.insertContent('@JHN');
    await waitFor(() => expect(popupOpen()).toBe(true));
    pressKey('Enter');
    // No token inserted — the raw query stays in the doc and the
    // newline ends the suggestion.
    expect(editor?.getText()).toMatch(/^@JHN/);
    await waitFor(() => expect(popupOpen()).toBe(false));
  });

  it('keeps the popup closed while typing after a token', async () => {
    await renderEditor();
    editor?.commands.insertContent('@JHN.3.16');
    await waitFor(() => expect(popupOpen()).toBe(true));
    pressKey('Enter');
    await waitFor(() => expect(popupOpen()).toBe(false));

    editor?.commands.insertContent('and more text');
    // Give the plugin a tick to (not) reactivate.
    await new Promise((r) => setTimeout(r, 50));
    expect(popupOpen()).toBe(false);
    expect(editor?.getText()).toContain('and more text');
  });

  it('dismisses the popup on Escape', async () => {
    await renderEditor();
    editor?.commands.insertContent('@JHN');
    await waitFor(() => expect(popupOpen()).toBe(true));
    expect(pressKey('Escape')).toBe(true);
    await waitFor(() => expect(popupOpen()).toBe(false));
  });

  it('shows an error line for an unknown book', async () => {
    await renderEditor();
    editor?.commands.insertContent('@ZZZ');
    await waitFor(() => expect(popupOpen()).toBe(true));
    await waitFor(() => {
      expect(document.body.textContent).toContain(
        'Unknown book: ZZZ'
      );
    });
  });

  it('rewrites the query when a book is clicked', async () => {
    await renderEditor();
    editor?.commands.insertContent('@');
    await waitFor(() => expect(popupOpen()).toBe(true));

    const john = document.querySelector(
      '[title="mention-book-JHN"]'
    );
    expect(john).toBeTruthy();
    fireEvent.click(john as Element);

    await waitFor(() =>
      expect(editor?.getText()).toBe('@JHN.')
    );
    // Picker still open, now showing chapters.
    await waitFor(() =>
      expect(
        document.querySelector('[title="mention-chapter-3"]')
      ).toBeTruthy()
    );
  });

  it('marks a dismissed invalid ref with a red decoration', async () => {
    await renderEditor();
    editor?.commands.insertContent('@JHN.99.1');
    await waitFor(() => expect(popupOpen()).toBe(true));
    // While the suggestion is active its range is skipped.
    expect(
      document.querySelector('.scripture-ref-invalid')
    ).toBeNull();
    pressKey('Escape');
    await waitFor(() => expect(popupOpen()).toBe(false));
    await waitFor(() =>
      expect(
        document.querySelector('.scripture-ref-invalid')
      ).toBeTruthy()
    );
  });

  it('does not mark a valid inserted token', async () => {
    await renderEditor();
    editor?.commands.insertContent('@JHN.3.16');
    await waitFor(() => expect(popupOpen()).toBe(true));
    pressKey('Enter');
    await waitFor(() => expect(popupOpen()).toBe(false));
    expect(
      document.querySelector('.scripture-ref-invalid')
    ).toBeNull();
  });

  it('inserts the full token when a verse is clicked', async () => {
    await renderEditor();
    editor?.commands.insertContent('@JHN.3.');
    await waitFor(() => expect(popupOpen()).toBe(true));

    const verse = document.querySelector(
      '[title="mention-verse-16"]'
    );
    expect(verse).toBeTruthy();
    fireEvent.click(verse as Element);

    await waitFor(() =>
      expect(editor?.getText()).toBe('@JHN.3.16 ')
    );
    await waitFor(() => expect(popupOpen()).toBe(false));
  });
});
