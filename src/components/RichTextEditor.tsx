import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { Global, Input, rem } from '@mantine/core';
import { RichTextEditor as MantineRichTextEditor } from '@mantine/tiptap';
import { useEditor } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import ScriptureMention from '../extensions/scriptureMention';
import { isTiptapDocString } from '../utils/tiptapContent';

interface RichTextEditorProps {
  /** Doc-JSON string or legacy plain text. */
  value: string;
  /** Emits JSON.stringify(editor.getJSON()). */
  onChange: (value: string) => void;
  variant: 'note' | 'comment';
  autoFocus?: boolean;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
}

// Legacy plain text loads as escaped text paragraphs — a '<' in
// old notes must never parse as markup.
const valueToContent = (value: string) => {
  if (!value) return '';
  if (isTiptapDocString(value)) return JSON.parse(value);
  return {
    type: 'doc',
    content: value.split('\n').map((line) => ({
      type: 'paragraph',
      content: line ? [{ type: 'text', text: line }] : undefined,
    })),
  };
};

export interface RichTextEditorHandle {
  editor: Editor | null;
}

const RichTextEditor = forwardRef<
  RichTextEditorHandle,
  RichTextEditorProps
>(function RichTextEditor(
  {
    value,
    onChange,
    variant,
    autoFocus = false,
    placeholder,
    label,
    disabled = false,
  },
  ref
) {
  // Last string this editor emitted — distinguishes external
  // value changes (reload/reset) from the editor's own edits.
  const lastEmitted = useRef<string | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({
        autolink: false,
        linkOnPaste: false,
        openOnClick: false,
        protocols: ['http', 'https', 'mailto'],
      }),
      Placeholder.configure({ placeholder: placeholder ?? '' }),
      ScriptureMention,
    ],
    content: valueToContent(value),
    autofocus: autoFocus ? 'end' : false,
    editable: !disabled,
    onUpdate: ({ editor: e }) => {
      const json = JSON.stringify(e.getJSON());
      lastEmitted.current = json;
      onChange(json);
    },
  });

  useImperativeHandle(ref, () => ({ editor }), [editor]);

  // External value changes (form reset, loading another note)
  // replace the doc; the editor's own emissions skip this.
  useEffect(() => {
    if (!editor) return;
    if (value === lastEmitted.current) return;
    if (value === JSON.stringify(editor.getJSON())) return;
    editor.commands.setContent(valueToContent(value));
    lastEmitted.current = value;
  }, [value, editor]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  const note = variant === 'note';

  return (
    <Input.Wrapper label={label}>
      {/* Subtle highlight on the live '@…' suggestion query. */}
      <Global
        styles={(theme) => ({
          '.ProseMirror span.suggestion': {
            backgroundColor:
              theme.colorScheme === 'dark'
                ? theme.colors.dark[5]
                : theme.colors.gray[2],
            borderRadius: 2,
          },
          '.ProseMirror .scripture-ref-invalid': {
            color:
              theme.colorScheme === 'dark'
                ? theme.colors.red[4]
                : theme.colors.red[7],
          },
        })}
      />
      <MantineRichTextEditor
        editor={editor}
        sx={(theme) => ({
          '.ProseMirror': {
            minHeight: note ? '70vh' : rem(76),
          },
          '.ProseMirror p.is-editor-empty:first-of-type::before':
            {
              content: 'attr(data-placeholder)',
              color:
                theme.colorScheme === 'dark'
                  ? theme.colors.dark[3]
                  : theme.colors.gray[5],
              float: 'left',
              height: 0,
              pointerEvents: 'none',
            },
        })}
      >
        <MantineRichTextEditor.Toolbar>
          <MantineRichTextEditor.ControlsGroup>
            <MantineRichTextEditor.Bold />
            <MantineRichTextEditor.Italic />
            <MantineRichTextEditor.Underline />
            {note && <MantineRichTextEditor.Strikethrough />}
          </MantineRichTextEditor.ControlsGroup>
          {note && (
            <MantineRichTextEditor.ControlsGroup>
              <MantineRichTextEditor.H1 />
              <MantineRichTextEditor.H2 />
              <MantineRichTextEditor.H3 />
            </MantineRichTextEditor.ControlsGroup>
          )}
          <MantineRichTextEditor.ControlsGroup>
            <MantineRichTextEditor.BulletList />
            <MantineRichTextEditor.OrderedList />
          </MantineRichTextEditor.ControlsGroup>
          {note && (
            <MantineRichTextEditor.ControlsGroup>
              <MantineRichTextEditor.Blockquote />
            </MantineRichTextEditor.ControlsGroup>
          )}
          <MantineRichTextEditor.ControlsGroup>
            <MantineRichTextEditor.Link />
            <MantineRichTextEditor.Unlink />
          </MantineRichTextEditor.ControlsGroup>
          {note && (
            <MantineRichTextEditor.ControlsGroup>
              <MantineRichTextEditor.ClearFormatting />
            </MantineRichTextEditor.ControlsGroup>
          )}
        </MantineRichTextEditor.Toolbar>
        <MantineRichTextEditor.Content />
      </MantineRichTextEditor>
    </Input.Wrapper>
  );
});

export default RichTextEditor;
