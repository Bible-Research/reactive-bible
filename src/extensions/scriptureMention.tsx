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
        book={parsed.bookName}
        chapter={parsed.chapter}
        verses={selectedVerses}
        bookFilter={
          parsed.bookName ? undefined : parsed.bookMatches
        }
        height={POPUP_HEIGHT}
        titlePrefix="mention-"
        onSelectBook={(bookName) => {
          const bookCode =
            BOOK_NAME_TO_CODE[bookName.toLowerCase()];
          if (bookCode) rewriteQuery(`@${bookCode}.`);
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
export const ScriptureMention = Extension.create({
  name: 'scriptureMention',

  addProseMirrorPlugins() {
    const editor = this.editor;
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
          if (suppressFrom === null) return true;
          if (range.from !== suppressFrom) {
            clearSuppression();
            return true;
          }
          const text = state.doc.textBetween(
            range.from,
            range.to,
            '\n',
            '\n'
          );
          return !text.slice(1).startsWith(suppressQuery);
        },
        render: popupRenderer,
      }),
      new Plugin({
        key: new PluginKey('scriptureRefInvalid'),
        props: { decorations: invalidRefDecorations },
      }),
    ];
  },
});

export default ScriptureMention;
