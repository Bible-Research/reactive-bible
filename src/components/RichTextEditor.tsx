import {
  forwardRef,
  useCallback,
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
import {
  IconIndentDecrease,
  IconIndentIncrease,
} from '@tabler/icons-react';
import ScriptureMention, {
  ScriptureMentionNode,
  ScriptureRefNode,
} from '../extensions/scriptureMention';
import Indent from '../extensions/indent';
import type { ScriptureMentionStorage } from '../extensions/scriptureMention';
import ScripturePassagePopover from './ScripturePassagePopover';
import useScriptureRefPreview from '../hooks/useScriptureRefPreview';
import { buildRefToken } from '../utils/scriptureRef';
import { toUsfmCode } from '../utils/bibleUtils';
import {
  transformPastedSlice,
  transformPastedText,
} from '../utils/clipboardSanitize';
import { markdownClipboardParser } from '../utils/markdownPaste';
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

  // Single click on a '@…' ref reveals the passage in a
  // floating panel anchored under the token — a preview only,
  // it does not link the note.
  const {
    preview: refPreview,
    error: refError,
    open: openRefPreview,
    close: closeRefPreview,
    setPreviewVerses,
  } = useScriptureRefPreview();

  // Doc positions of the token the preview is anchored to —
  // needed to rewrite it when the popover's expanded chapter
  // view narrows the ref to specific verses.
  const refEditRange = useRef<{
    from: number;
    to: number;
    token: string;
  } | null>(null);

  const handleRefPreview = useCallback(
    (
      token: string,
      anchor: Range,
      edit?: { from: number; to: number }
    ) => {
      refEditRange.current = edit ? { ...edit, token } : null;
      openRefPreview(token, anchor);
    },
    [openRefPreview]
  );

  const handleRefEditStart = useCallback(() => {
    refEditRange.current = null;
    closeRefPreview();
  }, [closeRefPreview]);

  const handleRefPreviewClose = useCallback(() => {
    refEditRange.current = null;
    closeRefPreview();
  }, [closeRefPreview]);

  const note = variant === 'note';

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
      ScriptureMention.configure({
        onRefPreview: handleRefPreview,
        // The double-click picker reopen must drop the open
        // preview or the two floating panels overlap.
        onRefEditStart: handleRefEditStart,
      }),
      // Preserve stored scriptureRef/mention nodes — without
      // schema entries the editor would strip them on load.
      ScriptureRefNode,
      ScriptureMentionNode,
      Indent,
    ],
    content: valueToContent(value),
    autofocus: autoFocus ? 'end' : false,
    editable: !disabled,
    // Note editors start one line high and grow with content up
    // to 60% of the viewport height, then scroll internally.
    // Comment editors cap at a smaller height for the same.
    editorProps: {
      // Pasted clipboard text (mobile keyboards, Docs, Word)
      // carries NBSPs/zero-width chars that break '#'/'-'/'>' and
      // '@…' token matching — normalize at the paste boundary.
      // Both paths are needed: transformPastedText only runs for
      // plain-text pastes; HTML pastes arrive as parsed slices.
      transformPastedText,
      transformPasted: transformPastedSlice,
      // TipTap paste rules only convert marks (**bold**, links);
      // block-level markdown ('#', '-', '>', '---') is parsed
      // here so pasted notes keep their structure.
      clipboardTextParser: markdownClipboardParser,
      attributes: {
        style: note
          ? 'max-height: 60vh; overflow-y: auto;'
          : `min-height: ${rem(76)};` +
            ` max-height: ${rem(240)}; overflow-y: auto;`,
      },
    },
    onUpdate: ({ editor: e }) => {
      const json = JSON.stringify(e.getJSON());
      lastEmitted.current = json;
      onChange(json);
    },
  });

  useImperativeHandle(ref, () => ({ editor }), [editor]);

  // Verse clicks in the popover's expanded chapter view narrow
  // the stored '@…' token (a whole-chapter pick widens it to
  // '@USFM.C'), then re-anchor the preview on the new token.
  // The rewrite is skipped when the token no longer sits where
  // the click recorded it — the preview still narrows.
  const handleSelectVerses = useCallback(
    (verses: number[] | null) => {
      const preview = refPreview;
      const ed = editor;
      const range = refEditRange.current;
      const code = preview?.ref
        ? toUsfmCode(preview.ref.book)
        : null;
      if (!preview?.ref || !ed || !range || !code) {
        setPreviewVerses(verses);
        return;
      }
      const token = buildRefToken(
        code,
        preview.ref.chapter,
        verses
      );
      let tokenIntact = false;
      try {
        if (
          ed.state.doc.textBetween(range.from, range.to) ===
          range.token
        ) {
          tokenIntact = true;
        } else {
          // Stored scriptureRef/mention atoms carry no text —
          // their node range is what the click recorded.
          const nodeAfter =
            ed.state.doc.resolve(range.from).nodeAfter;
          tokenIntact =
            !!nodeAfter &&
            (nodeAfter.type.name === 'scriptureRef' ||
              nodeAfter.type.name === 'mention') &&
            range.to === range.from + nodeAfter.nodeSize;
        }
      } catch {
        tokenIntact = false;
      }
      if (!tokenIntact) {
        setPreviewVerses(verses);
        return;
      }
      // insertContentAt leaves the caret right after the new
      // token; at a paragraph end that reads as a live '@…'
      // query and would reopen the picker stacked over the
      // preview. Same suppression the picker applies to its
      // own insertions.
      (
        ed.storage.scriptureMention as
          | ScriptureMentionStorage
          | undefined
      )?.suppressQuery?.(range.from, token.slice(1));
      ed.chain()
        .insertContentAt(
          { from: range.from, to: range.to },
          token
        )
        .run();
      const to = range.from + token.length;
      try {
        const r = document.createRange();
        const start = ed.view.domAtPos(range.from);
        const end = ed.view.domAtPos(to);
        r.setStart(start.node, start.offset);
        r.setEnd(end.node, end.offset);
        handleRefPreview(token, r, { from: range.from, to });
      } catch {
        setPreviewVerses(verses);
      }
    },
    [
      editor,
      refPreview,
      setPreviewVerses,
      handleRefPreview,
    ]
  );

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
              <MantineRichTextEditor.Control
                onClick={() =>
                  editor?.chain().focus().outdent().run()
                }
                aria-label="Decrease indent"
                title="Decrease indent"
              >
                <IconIndentDecrease size={16} stroke={1.5} />
              </MantineRichTextEditor.Control>
              <MantineRichTextEditor.Control
                onClick={() =>
                  editor?.chain().focus().indent().run()
                }
                aria-label="Increase indent"
                title="Increase indent"
              >
                <IconIndentIncrease size={16} stroke={1.5} />
              </MantineRichTextEditor.Control>
            </MantineRichTextEditor.ControlsGroup>
          )}
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
      {refPreview && (
        <ScripturePassagePopover
          reference={refPreview.ref}
          error={refError}
          anchor={refPreview.anchor}
          onSelectVerses={handleSelectVerses}
          onClose={handleRefPreviewClose}
        />
      )}
    </Input.Wrapper>
  );
});

export default RichTextEditor;
