import { describe, it, expect } from 'vitest';
import {
  docToPlainText,
  isTiptapDocString,
  toPlainText,
} from './tiptapContent';

const doc = (content: unknown[]) =>
  JSON.stringify({ type: 'doc', content });

describe('isTiptapDocString', () => {
  it('returns true for a serialized doc', () => {
    expect(
      isTiptapDocString(
        doc([{ type: 'paragraph' }])
      )
    ).toBe(true);
  });

  it('returns true for an empty-content doc', () => {
    expect(isTiptapDocString(doc([]))).toBe(true);
  });

  it('returns false for plain text', () => {
    expect(isTiptapDocString('hello world')).toBe(false);
    expect(isTiptapDocString('')).toBe(false);
  });

  it('returns false for non-doc JSON', () => {
    expect(isTiptapDocString('{"type":"paragraph"}')).toBe(false);
    expect(isTiptapDocString('[1,2,3]')).toBe(false);
    expect(isTiptapDocString('123')).toBe(false);
    expect(isTiptapDocString('{"type":"doc"}')).toBe(false);
  });

  it('returns false for invalid JSON', () => {
    expect(isTiptapDocString('{oops')).toBe(false);
  });
});

describe('docToPlainText', () => {
  it('joins paragraphs with newlines', () => {
    const s = doc([
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'line one' }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'line two' }],
      },
    ]);
    expect(docToPlainText(s)).toBe('line one\nline two');
  });

  it('handles hardBreak inside a paragraph', () => {
    const s = doc([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'a' },
          { type: 'hardBreak' },
          { type: 'text', text: 'b' },
        ],
      },
    ]);
    expect(docToPlainText(s)).toBe('a\nb');
  });

  it('extracts text from lists and headings', () => {
    const s = doc([
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Title' }],
      },
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'item 1' }],
              },
            ],
          },
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'item 2' }],
              },
            ],
          },
        ],
      },
    ]);
    const plain = docToPlainText(s);
    expect(plain).toContain('Title');
    expect(plain).toContain('item 1');
    expect(plain).toContain('item 2');
  });

  it('returns empty string for an empty doc', () => {
    expect(
      docToPlainText(doc([{ type: 'paragraph' }])).trim()
    ).toBe('');
  });

  it('returns empty string for malformed JSON', () => {
    expect(docToPlainText('{bad json')).toBe('');
  });
});

describe('toPlainText', () => {
  it('passes plain text through', () => {
    expect(toPlainText('just text')).toBe('just text');
  });

  it('converts doc-JSON to plain text', () => {
    const s = doc([
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'note body' }],
      },
    ]);
    expect(toPlainText(s)).toBe('note body');
  });
});
