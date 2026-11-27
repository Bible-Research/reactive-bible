// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Indent from './indent';

// jsdom lacks requestAnimationFrame — TipTap's focus()
// command schedules its delayed focus through it.
if (typeof window.requestAnimationFrame !== 'function') {
  window.requestAnimationFrame = (cb: FrameRequestCallback) =>
    window.setTimeout(() => cb(0), 0);
}
if (typeof window.cancelAnimationFrame !== 'function') {
  window.cancelAnimationFrame = (id: number) =>
    window.clearTimeout(id);
}

const makeEditor = () =>
  new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit, Indent],
    content:
      '<ul><li><p>first</p></li><li><p>second</p></li></ul>',
  });

// Position of the 'second' text node inside its list item.
const SECOND_TEXT_POS = 12;

describe('Indent', () => {
  it('sinks a list item from a chained command without a ' +
    'mismatched transaction', () => {
    const editor = makeEditor();
    // The toolbar buttons run chain().focus().indent().run():
    // the inner sink must apply inside the SAME transaction —
    // a nested editor.chain().run() dispatches a second
    // transaction and leaves the outer one stale
    // ("Applying a mismatched transaction").
    expect(() =>
      editor
        .chain()
        .focus()
        .setTextSelection(SECOND_TEXT_POS)
        .indent()
        .run()
    ).not.toThrow();
    // 'second' is now nested under 'first' — without the fix
    // the inner dispatch was either thrown away or crashed.
    expect(editor.state.doc.textContent).toContain('second');
    expect(editor.getHTML()).toContain(
      '<ul><li><p>first</p><ul><li><p>second</p></li></ul>'
    );
    editor.destroy();
  });

  it('lifts a nested list item without a mismatched ' +
    'transaction', () => {
    const editor = new Editor({
      element: document.createElement('div'),
      extensions: [StarterKit, Indent],
      content:
        '<ul><li><p>first</p>' +
        '<ul><li><p>nested</p></li></ul></li></ul>',
    });
    // Caret inside the nested 'nested' text.
    const text = 'nested';
    let pos = -1;
    editor.state.doc.descendants((node, p) => {
      if (pos === -1 && node.isText && node.text === text) {
        pos = p;
      }
    });
    expect(pos).toBeGreaterThan(-1);
    expect(() =>
      editor.chain().focus().setTextSelection(pos).outdent().run()
    ).not.toThrow();
    expect(editor.getHTML()).toContain(
      '<ul><li><p>first</p></li><li><p>nested</p></li></ul>'
    );
    editor.destroy();
  });
});
