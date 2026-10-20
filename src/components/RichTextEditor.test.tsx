// @vitest-environment jsdom
import React, { createRef } from 'react';
import { screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import RichTextEditor from './RichTextEditor';
import type { RichTextEditorHandle } from './RichTextEditor';
import { isTiptapDocString } from '../utils/tiptapContent';
import { renderWithProviders } from '../__tests__/helpers';

const renderEditor = (ui: React.ReactElement) =>
  renderWithProviders(ui);

describe('RichTextEditor', () => {
  it('mounts with toolbar and editable content', () => {
    const { container } = renderEditor(
      <RichTextEditor
        variant="comment"
        value=""
        onChange={vi.fn()}
      />
    );
    expect(
      container.querySelector('.ProseMirror')
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /bold/i })
    ).toBeInTheDocument();
  });

  it('loads legacy plain text without parsing markup', async () => {
    renderEditor(
      <RichTextEditor
        variant="note"
        value={'a < b & "quotes"\nsecond line'}
        onChange={vi.fn()}
      />
    );
    await waitFor(() => {
      expect(document.body.textContent).toContain(
        'a < b & "quotes"'
      );
      expect(document.body.textContent).toContain(
        'second line'
      );
    });
  });

  it('emits doc-JSON on change', async () => {
    const onChange = vi.fn();
    const ref = createRef<RichTextEditorHandle>();
    renderEditor(
      <RichTextEditor
        ref={ref}
        variant="comment"
        value=""
        onChange={onChange}
      />
    );
    await waitFor(() => expect(ref.current?.editor).toBeTruthy());
    ref.current?.editor?.commands.insertContent('hello');
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const emitted = onChange.mock.calls.at(-1)?.[0] as string;
    expect(isTiptapDocString(emitted)).toBe(true);
    expect(emitted).toContain('hello');
  });

  it('renders the label', () => {
    renderEditor(
      <RichTextEditor
        variant="note"
        label="Note"
        value=""
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText('Note')).toBeInTheDocument();
  });

  it('note editor grows up to 60vh then scrolls', () => {
    const { container } = renderEditor(
      <RichTextEditor
        variant="note"
        value=""
        onChange={vi.fn()}
      />
    );
    const proseMirror = container.querySelector<HTMLElement>(
      '.ProseMirror'
    );
    expect(proseMirror?.style.maxHeight).toBe('60vh');
    expect(proseMirror?.style.overflowY).toBe('auto');
    expect(proseMirror?.style.minHeight).toBe('');
  });

  it('comment editor grows up to a cap then scrolls', () => {
    const { container } = renderEditor(
      <RichTextEditor
        variant="comment"
        value=""
        onChange={vi.fn()}
      />
    );
    const proseMirror = container.querySelector<HTMLElement>(
      '.ProseMirror'
    );
    expect(proseMirror?.style.minHeight).toBeTruthy();
    expect(proseMirror?.style.maxHeight).toBeTruthy();
    expect(proseMirror?.style.overflowY).toBe('auto');
  });

  it('preserves scriptureRef/mention nodes in stored docs', async () => {
    const stored = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'scriptureRef',
              attrs: {
                code: 'JHN',
                chapter: 3,
                verseStart: 16,
                verseEnd: 18,
              },
            },
          ],
        },
      ],
    });
    const ref = createRef<RichTextEditorHandle>();
    renderEditor(
      <RichTextEditor
        ref={ref}
        variant="note"
        value={stored}
        onChange={vi.fn()}
      />
    );
    await waitFor(() => expect(ref.current?.editor).toBeTruthy());
    const json = JSON.stringify(ref.current?.editor?.getJSON());
    // Without the light node spec the editor strips the node on
    // load and a save would silently lose it.
    expect(json).toContain('scriptureRef');
    expect(json).toContain('JHN');
    expect(document.body.textContent).toContain('@JHN.3.16-18');
  });
});
