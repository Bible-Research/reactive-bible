import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import RichTextView from './RichTextView';
import { renderWithProviders } from '../__tests__/helpers';

const doc = (content: unknown[]) =>
  JSON.stringify({ type: 'doc', content });

describe('RichTextView', () => {
  it('renders legacy plain text via linkify', () => {
    const onRef = vi.fn();
    renderWithProviders(
      <RichTextView
        content="See @JHN.3.16 for details"
        onScriptureRef={onRef}
      />
    );
    const link = screen.getByText('@JHN.3.16');
    fireEvent.click(link);
    expect(onRef).toHaveBeenCalledWith('@JHN.3.16', link);
  });

  it('renders doc-JSON paragraphs and marks', () => {
    renderWithProviders(
      <RichTextView
        onScriptureRef={vi.fn()}
        content={doc([
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'plain ' },
              {
                type: 'text',
                text: 'bold',
                marks: [{ type: 'bold' }],
              },
            ],
          },
        ])}
      />
    );
    expect(screen.getByText('bold').tagName).toBe('STRONG');
  });

  it('linkifies @refs inside doc text nodes', () => {
    const onRef = vi.fn();
    renderWithProviders(
      <RichTextView
        onScriptureRef={onRef}
        content={doc([
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'read @JHN.3.16 now' },
            ],
          },
        ])}
      />
    );
    const link = screen.getByText('@JHN.3.16');
    fireEvent.click(link);
    expect(onRef).toHaveBeenCalledWith('@JHN.3.16', link);
  });

  it('renders invalid refs in red, not as links', () => {
    renderWithProviders(
      <RichTextView
        content="Bad @JHN.99.1 and good @JHN.3.16"
        onScriptureRef={vi.fn()}
      />
    );
    const bad = screen.getByText('@JHN.99.1');
    expect(bad.tagName).not.toBe('A');
    expect(bad.tagName).toBe('SPAN');
    expect(
      screen.queryByRole('link', { name: '@JHN.99.1' })
    ).toBeNull();
    expect(screen.getByText('@JHN.3.16').tagName).toBe('A');
  });

  it('renders invalid refs red inside doc text nodes', () => {
    renderWithProviders(
      <RichTextView
        onScriptureRef={vi.fn()}
        content={doc([
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'nope @ZZZ.1.1 here' },
            ],
          },
        ])}
      />
    );
    expect(screen.getByText('@ZZZ.1.1').tagName).toBe('SPAN');
  });

  it('renders safe links but rejects javascript: hrefs', () => {
    renderWithProviders(
      <RichTextView
        onScriptureRef={vi.fn()}
        content={doc([
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'safe link',
                marks: [
                  {
                    type: 'link',
                    attrs: { href: 'https://example.com' },
                  },
                ],
              },
              { type: 'text', text: ' ' },
              {
                type: 'text',
                text: 'evil link',
                marks: [
                  {
                    type: 'link',
                    attrs: { href: 'javascript:alert(1)' },
                  },
                ],
              },
            ],
          },
        ])}
      />
    );
    expect(
      screen.getByRole('link', { name: 'safe link' })
    ).toHaveAttribute('href', 'https://example.com');
    expect(
      screen.queryByRole('link', { name: 'evil link' })
    ).not.toBeInTheDocument();
    expect(screen.getByText('evil link')).toBeInTheDocument();
  });

  it('renders headings and lists', () => {
    renderWithProviders(
      <RichTextView
        onScriptureRef={vi.fn()}
        content={doc([
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'My heading' }],
          },
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      { type: 'text', text: 'first item' },
                    ],
                  },
                ],
              },
            ],
          },
        ])}
      />
    );
    expect(
      screen.getByRole('heading', { name: 'My heading' })
    ).toBeInTheDocument();
    expect(screen.getByText('first item')).toBeInTheDocument();
    expect(
      screen.getByText('first item').closest('ul')
    ).not.toBeNull();
  });

  it('renders unknown nodes gracefully', () => {
    renderWithProviders(
      <RichTextView
        onScriptureRef={vi.fn()}
        content={doc([
          { type: 'mysteryNode', attrs: { foo: 1 } },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'still here' }],
          },
        ])}
      />
    );
    expect(screen.getByText('still here')).toBeInTheDocument();
  });

  it('renders scriptureRef nodes as focusable anchors', () => {
    const onRef = vi.fn();
    renderWithProviders(
      <RichTextView
        onScriptureRef={onRef}
        content={doc([
          {
            type: 'paragraph',
            content: [
              {
                type: 'scriptureRef',
                attrs: {
                  code: 'JHN',
                  chapter: 3,
                  verseStart: 16,
                },
              },
            ],
          },
        ])}
      />
    );
    const link = screen.getByRole('link', {
      name: 'John 3:16',
    });
    expect(link).toHaveAttribute('href', '#');
    // Same marker the editor's ScriptureRefNode emits.
    expect(link).toHaveAttribute('data-scripture-ref');
    fireEvent.click(link);
    expect(onRef).toHaveBeenCalledWith('@JHN.3.16', link);
  });

  describe('untrusted doc-JSON (crash guards)', () => {
    it('ignores non-array content and non-object children', () => {
      renderWithProviders(
        <RichTextView
          onScriptureRef={vi.fn()}
          content={doc([
            { type: 'paragraph', content: 'oops' },
            { type: 'paragraph', content: 42 },
            {
              type: 'paragraph',
              content: [
                null,
                7,
                'loose string',
                { type: 'text', text: 'survives' },
              ],
            },
          ])}
        />
      );
      expect(screen.getByText('survives')).toBeInTheDocument();
    });

    it('ignores non-array marks and non-object mark entries', () => {
      renderWithProviders(
        <RichTextView
          onScriptureRef={vi.fn()}
          content={doc([
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'plain1',
                  marks: { type: 'bold' },
                },
                {
                  type: 'text',
                  text: 'plain2',
                  marks: [null, 'x', { type: 'bold' }],
                },
              ],
            },
          ])}
        />
      );
      expect(screen.getByText('plain1')).toBeInTheDocument();
      expect(
        screen.getByText('plain2').tagName
      ).toBe('STRONG');
    });

    it('ignores non-string text values', () => {
      renderWithProviders(
        <RichTextView
          onScriptureRef={vi.fn()}
          content={doc([
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 123 },
                { type: 'text', text: 'after' },
              ],
            },
          ])}
        />
      );
      expect(screen.getByText('after')).toBeInTheDocument();
    });

    it('caps recursion on a deeply nested doc', () => {
      let node: Record<string, unknown> = {
        type: 'text',
        text: 'deep',
      };
      // list-in-list is valid HTML — keeps the test quiet.
      for (let i = 0; i < 100; i++) {
        node = {
          type: 'bulletList',
          content: [{ type: 'listItem', content: [node] }],
        };
      }
      const content = JSON.stringify({
        type: 'doc',
        content: [
          node,
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'sibling' }],
          },
        ],
      });
      renderWithProviders(
        <RichTextView
          onScriptureRef={vi.fn()}
          content={content}
        />
      );
      // No stack overflow; siblings still render.
      expect(screen.getByText('sibling')).toBeInTheDocument();
    });

    it('caps rendering on a huge doc', () => {
      const content = doc(
        Array.from({ length: 6000 }, (_, i) => ({
          type: 'paragraph',
          content: [{ type: 'text', text: `v${i}` }],
        }))
      );
      renderWithProviders(
        <RichTextView
          onScriptureRef={vi.fn()}
          content={content}
        />
      );
      expect(screen.getByText('v0')).toBeInTheDocument();
      expect(screen.queryByText('v5999')).toBeNull();
    });

    it('renders raw text for a doc that fails to parse', () => {
      // JSON.parse bomb — so deep even parsing throws. The
      // boundary must degrade to a safe render, not a blank page.
      const content = `${'['.repeat(200000)}`;
      renderWithProviders(
        <RichTextView
          onScriptureRef={vi.fn()}
          content={`{"type":"doc","content":${content}}`}
        />
      );
      // No crash — anything rendered is fine.
      expect(document.body).toBeInTheDocument();
    });
  });
});
