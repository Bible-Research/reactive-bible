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
});
