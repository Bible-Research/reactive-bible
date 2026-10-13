import { Extension } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import Suggestion from '@tiptap/suggestion';
import type {
  SuggestionKeyDownProps,
  SuggestionProps,
} from '@tiptap/suggestion';
import { Paper, Text } from '@mantine/core';
import PassagePicker from '../components/PassagePicker';
import {
  buildScriptureToken,
  formatMentionPreview,
  isTerminatedMentionQuery,
  isValidScriptureToken,
  parseMentionQuery,
} from '../utils/scriptureMention';
import {
  SCRIPTURE_TOKEN_REGEX,
  VALID_REF_PREFIX,
} from '../utils/scriptureLinkify';
import { BOOK_NAME_TO_CODE } from '../utils/bibleUtils';
import { findVersesInBetween } from '../utils/findVersesInBetween';

const POPUP_HEIGHT = 280;
const POPUP_OFFSET = 4;
// Delay before a lone click on a '@…' token fires the passage
// preview — a second click within the window edits instead.
const PREVIEW_CLICK_MS = 300;

export interface ScriptureMentionOptions {
  /**
   * Single click/tap on a complete '@USFM.C.V[-E]' token.
   * Intended to reveal the passage — it does NOT link the note
   * to that passage.
   */
  onRefPreview: (token: string) => void;
}

interface PopupActions {
  /** Replace the live '@query' range, keeping the suggestion open. */
  rewriteQuery: (text: string) => void;
  /** Insert a finished '@USFM.C.V[-E] ' token and close the popup. */
  insertToken: (token: string) => void;
}

interface PopupProps extends PopupActions {
  query: string;
}

const ScriptureMentionPopup = ({
  query,
  rewriteQuery,
  insertToken,
}: PopupProps) => {
  const parsed = parseMentionQuery(query);
  const code = parsed.bookName
    ? BOOK_NAME_TO_CODE[parsed.bookName.toLowerCase()]
    : null;
  const preview = formatMentionPreview(parsed);
  const selectedVerses =
    parsed.verseStart !== null
      ? parsed.verseEnd !== null
        ? findVersesInBetween(
            String(parsed.verseStart),
            String(parsed.verseEnd)
          )
        : [parsed.verseStart]
      : [];

  const handleSelectVerse = (verse: number, extendRange: boolean) => {
    if (!code || parsed.chapter === null) return;
    if (
      extendRange &&
      parsed.verseStart !== null &&
      parsed.verseStart !== verse
    ) {
      const [lo, hi] = [
        Math.min(parsed.verseStart, verse),
        Math.max(parsed.verseStart, verse),
      ];
      insertToken(`@${code}.${parsed.chapter}.${lo}-${hi}`);
      return;
    }
    insertToken(`@${code}.${parsed.chapter}.${verse}`);
  };

  return (
    <Paper
      shadow="md"
      p="xs"
      withBorder
      // Keep mousedown from moving focus out of the editor.
      onMouseDown={(e) => e.preventDefault()}
      sx={{ width: 320 }}
    >
      <Text size="xs" color={parsed.error ? 'red' : 'dimmed'} mb={4}>
        {parsed.error ?? (preview || 'Type @ to cite a passage')}
      </Text>
      <PassagePicker
        bookId={code ?? null}
        chapter={parsed.chapter}
        verses={selectedVerses}
        bookFilter={
          parsed.bookName ? undefined : parsed.bookMatches
        }
        height={POPUP_HEIGHT}
        titlePrefix="mention-"
        onSelectBook={(bookId) => {
          rewriteQuery(`@${bookId}.`);
        }}
        onSelectChapter={(ch) => {
          if (code) rewriteQuery(`@${code}.${ch}.`);
        }}
        onSelectVerse={handleSelectVerse}
      />
    </Paper>
  );
};

/**
 * '@' suggestion that drives a three-column PassagePicker popup.
 * Inserts plain-text '@USFM.C.V[-E]' tokens which the existing
 * linkify pipeline already renders.
 */
export const ScriptureMention = Extension.create<
  ScriptureMentionOptions
>({
  name: 'scriptureMention',

  addOptions() {
    return { onRefPreview: () => undefined };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    const onRefPreview = this.options.onRefPreview;
    const pluginKey = new PluginKey('scriptureMention');

    // After inserting a token the '@…' text still matches the
    // suggestion trigger (allowSpaces swallows trailing text into
    // the query). Suppress the match anchored at the inserted '@'
    // for as long as the query still begins with the inserted
    // token text — typing normal prose keeps the popup closed,
    // editing the token itself reopens it.
    let suppressFrom: number | null = null;
    let suppressQuery = '';

    const suppress = (from: number, query: string) => {
      suppressFrom = from;
      suppressQuery = query;
    };

    const clearSuppression = () => {
      suppressFrom = null;
      suppressQuery = '';
    };

    // Marks '@…' tokens that don't resolve to a complete,
    // in-range ref with a red inline decoration. The live
    // suggestion range and code-formatted text are skipped.
    const invalidRefDecorations = (state: EditorState) => {
      const suggestion = pluginKey.getState(state) as
        | { active: boolean; range: { from: number; to: number } }
        | undefined;
      const activeRange = suggestion?.active
        ? suggestion.range
        : null;
      const decorations: Decoration[] = [];
      state.doc.descendants((node, pos, parent) => {
        if (!node.isText || !node.text) return;
        if (parent?.type.name === 'codeBlock') return;
        if (node.marks.some((m) => m.type.name === 'code')) return;
        SCRIPTURE_TOKEN_REGEX.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = SCRIPTURE_TOKEN_REGEX.exec(node.text))) {
          const token = match[1];
          const candidate =
            token.match(VALID_REF_PREFIX)?.[1] ?? token;
          if (isValidScriptureToken(candidate)) continue;
          const from = pos + match.index;
          const to = from + candidate.length;
          if (
            activeRange &&
            from >= activeRange.from &&
            to <= activeRange.to
          ) {
            continue;
          }
          decorations.push(
            Decoration.inline(from, to, {
              class: 'scripture-ref-invalid',
            })
          );
        }
      });
      return DecorationSet.create(state.doc, decorations);
    };

    // The '@…' token covering `pos`, if it resolves to a
    // complete, in-range ref. Same exclusions as
    // invalidRefDecorations: code is never clickable.
    const tokenAtPos = (
      state: EditorState,
      pos: number
    ): { from: number; to: number; token: string } | null => {
      const $pos = state.doc.resolve(pos);
      const parent = $pos.parent;
      if (
        !parent.isTextblock ||
        parent.type.name === 'codeBlock'
      ) {
        return null;
      }
      const blockStart = $pos.start();
      let hit: { from: number; to: number; token: string } | null =
        null;
      parent.forEach((node, offset) => {
        if (hit || !node.isText || !node.text) return;
        if (node.marks.some((m) => m.type.name === 'code')) {
          return;
        }
        SCRIPTURE_TOKEN_REGEX.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = SCRIPTURE_TOKEN_REGEX.exec(node.text))) {
          const candidate =
            match[1].match(VALID_REF_PREFIX)?.[1] ?? match[1];
          const from = blockStart + offset + match.index;
          const to = from + candidate.length;
          if (
            pos >= from &&
            pos <= to &&
            isValidScriptureToken(candidate)
          ) {
            hit = { from, to, token: candidate };
            return;
          }
        }
      });
      return hit;
    };

    // Single vs double click on a '@…' token: a lone click
    // previews the passage; a second click reopens the picker
    // to edit the reference instead.
    let previewTimer: ReturnType<typeof setTimeout> | null = null;
    const clearPreviewTimer = () => {
      if (previewTimer !== null) {
        clearTimeout(previewTimer);
        previewTimer = null;
      }
    };

    const popupRenderer = () => {
      let renderer: ReactRenderer | null = null;
      let popupEl: HTMLDivElement | null = null;
      let current: SuggestionProps | null = null;

      const rewriteQuery = (text: string) => {
        if (!current) return;
        editor
          .chain()
          .focus()
          .insertContentAt(current.range, text)
          .run();
      };

      const insertToken = (token: string) => {
        if (!current) return;
        suppress(current.range.from, `${token.slice(1)} `);
        editor
          .chain()
          .focus()
          .insertContentAt(current.range, `${token} `)
          .run();
      };

      const position = () => {
        if (!popupEl) return;
        const rect = current?.clientRect?.();
        if (!rect) {
          popupEl.style.display = 'none';
          return;
        }
        popupEl.style.display = '';
        const fitsBelow =
          rect.bottom + POPUP_HEIGHT + POPUP_OFFSET <
          window.innerHeight;
        popupEl.style.top = `${
          fitsBelow
            ? rect.bottom + POPUP_OFFSET
            : Math.max(0, rect.top - POPUP_HEIGHT - POPUP_OFFSET)
        }px`;
        popupEl.style.left = `${Math.min(
          rect.left,
          Math.max(0, window.innerWidth - 330)
        )}px`;
      };

      return {
        onStart: (props: SuggestionProps) => {
          current = props;
          renderer = new ReactRenderer(ScriptureMentionPopup, {
            editor,
            props: {
              query: props.query,
              rewriteQuery,
              insertToken,
            },
          });
          popupEl = document.createElement('div');
          popupEl.style.position = 'fixed';
          popupEl.style.zIndex = '10000';
          popupEl.appendChild(renderer.element);
          document.body.appendChild(popupEl);
          position();
        },
        onUpdate: (props: SuggestionProps) => {
          current = props;
          renderer?.updateProps({ query: props.query });
          position();
        },
        onKeyDown: ({
          event,
          view,
          range,
        }: SuggestionKeyDownProps) => {
          if (event.key === 'Escape') {
            // Keep the keypress from bubbling to window — the
            // enclosing Mantine Modal would otherwise also see it
            // and close, discarding the in-progress note.
            event.stopPropagation();
            const state = pluginKey.getState(view.state);
            suppress(range.from, state?.query ?? '');
            // Empty transaction re-runs `apply`, which deactivates
            // the suggestion via `allow` and fires onExit.
            view.dispatch(view.state.tr);
            return true;
          }
          if (event.key === 'Enter' || event.key === 'Tab') {
            const state = pluginKey.getState(view.state);
            const parsed = parseMentionQuery(state?.query ?? '');
            if (!parsed.complete) return false;
            const token = buildScriptureToken(parsed);
            if (!token) return false;
            suppress(state.range.from, `${token.slice(1)} `);
            editor
              .chain()
              .focus()
              .insertContentAt(state.range, `${token} `)
              .run();
            return true;
          }
          return false;
        },
        onExit: () => {
          popupEl?.remove();
          popupEl = null;
          renderer?.destroy();
          renderer = null;
          current = null;
        },
      };
    };

    return [
      Suggestion({
        editor,
        pluginKey,
        char: '@',
        allowSpaces: true,
        allowedPrefixes: [' ', '('],
        items: () => [],
        allow: ({ state, range }) => {
          const text = state.doc.textBetween(
            range.from,
            range.to,
            '\n',
            '\n'
          );
          // A complete ref closed by '.' or ' ' means the user
          // typed it out by hand — keep the picker dismissed.
          if (isTerminatedMentionQuery(text.slice(1))) {
            return false;
          }
          if (suppressFrom === null) return true;
          if (range.from !== suppressFrom) {
            clearSuppression();
            return true;
          }
          return !text.slice(1).startsWith(suppressQuery);
        },
        render: popupRenderer,
      }),
      new Plugin({
        key: new PluginKey('scriptureRefInvalid'),
        props: { decorations: invalidRefDecorations },
      }),
      new Plugin({
        key: new PluginKey('scriptureRefClick'),
        props: {
          handleDOMEvents: {
            mousedown: (view, event) => {
              const mouse = event as MouseEvent;
              if (mouse.button !== 0) return false;
              const pos = view.posAtCoords({
                left: mouse.clientX,
                top: mouse.clientY,
              })?.pos;
              if (pos === undefined) return false;
              const hit = tokenAtPos(view.state, pos);
              if (!hit) return false;
              mouse.preventDefault();
              if (mouse.detail > 1) {
                // Double click: caret lands at the token end so
                // the suggestion range covers the whole '@…'
                // token and the picker reopens for editing.
                clearPreviewTimer();
                editor.commands.setTextSelection(hit.to);
                return true;
              }
              const { token } = hit;
              clearPreviewTimer();
              previewTimer = setTimeout(() => {
                previewTimer = null;
                onRefPreview(token);
              }, PREVIEW_CLICK_MS);
              return true;
            },
          },
        },
        view: () => ({ destroy: clearPreviewTimer }),
      }),
    ];
  },
});

export default ScriptureMention;
