import { Extension } from '@tiptap/core';
import type { CommandProps } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    indent: {
      /** Sink a list item, else bump block indent one step. */
      indent: () => ReturnType;
      /** Lift a list item, else drop block indent one step. */
      outdent: () => ReturnType;
    };
  }
}

const MAX_INDENT = 8;
const INDENT_STEP_EM = 2;
const INDENT_TYPES = ['paragraph', 'heading'];

/**
 * Block indentation for the note editor. Paragraphs and
 * headings carry a `data-indent` attribute rendered as an
 * inline `margin-left`, so saved doc JSON and RichTextView
 * keep the indentation with no extra CSS. When the caret
 * sits inside a list the commands sink/lift the list item
 * instead.
 */
const Indent = Extension.create({
  name: 'indent',

  addGlobalAttributes() {
    return [
      {
        types: INDENT_TYPES,
        attributes: {
          indent: {
            default: 0,
            parseHTML: (el: HTMLElement) =>
              Number(el.getAttribute('data-indent')) || 0,
            renderHTML: (attrs: { indent?: number }) =>
              attrs.indent
                ? {
                    'data-indent': attrs.indent,
                    style:
                      `margin-left: ` +
                      `${attrs.indent * INDENT_STEP_EM}em`,
                  }
                : {},
          },
        },
      },
    ];
  },

  addCommands() {
    const shift =
      (delta: number) =>
      ({ tr, state, dispatch }: CommandProps) => {
        const { from, to } = state.selection;
        let changed = false;
        state.doc.nodesBetween(from, to, (node, pos) => {
          if (!INDENT_TYPES.includes(node.type.name)) return;
          const current = Number(node.attrs.indent) || 0;
          const next = Math.min(
            Math.max(current + delta, 0),
            MAX_INDENT
          );
          if (next === current) return;
          if (dispatch) {
            tr.setNodeMarkup(pos, node.type, {
              ...node.attrs,
              indent: next,
            });
          }
          changed = true;
        });
        return changed;
      };
    return {
      indent:
        () =>
        (props: CommandProps) =>
          props.editor.can().sinkListItem('listItem')
            ? props.editor
                .chain()
                .sinkListItem('listItem')
                .run()
            : shift(1)(props),
      outdent:
        () =>
        (props: CommandProps) =>
          props.editor.can().liftListItem('listItem')
            ? props.editor
                .chain()
                .liftListItem('listItem')
                .run()
            : shift(-1)(props),
    };
  },
});

export default Indent;
