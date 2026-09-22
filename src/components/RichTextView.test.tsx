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
    expect(onRef).toHaveBeenCalledWith('@JHN.3.16');
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
    fireEvent.click(screen.getByText('@JHN.3.16'));
    expect(onRef).toHaveBeenCalledWith('@JHN.3.16');
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
});
