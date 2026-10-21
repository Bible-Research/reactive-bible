import { Fragment, Slice } from '@tiptap/pm/model';
import type {
  Node as PMNode,
  ResolvedPos,
  Schema,
} from '@tiptap/pm/model';
import type { EditorProps, EditorView } from '@tiptap/pm/view';

/**
 * Block-level markdown paste parser. TipTap's own paste rules
 * only convert marks (**bold**, *italic*, `code`, ~~strike~~,
 * links) — pasted '# heading', '- list', '> quote' or '---'
 * lines would land as literal text. When the clipboard looks
 * like markdown this converts each block token to the matching
 * schema node; the extension paste rules still run afterwards
 * (appendTransaction on the paste), so inline '**…**' inside
 * headings and list items converts as usual.
 *
 * Whitespace is already normalized by transformPastedText before
 * this runs, so plain ASCII space/tab matching is enough.
 */

// A line that can only mean markdown structure — the gate that
// keeps ordinary pasted prose on ProseMirror's default path.
// Bullet glyphs Word/Outlook/Google Docs put on text/plain
// (•, ◦, ▪) instead of an ASCII '-'.
const BULLET_CHARS = '-*+•◦▪';

const MARKDOWN_BLOCK_RE = new RegExp(
  '^[ \\t]*(?:' +
    '#{1,6}[ \\t]|' + // '# heading'
    '>[ \\t]?|' + // '> quote'
    `[${BULLET_CHARS}][ \\t]|` + // '- item'
    '\\d{1,9}[.)][ \\t]|' + // '1. item'
    '```|~~~|' + // code fence
    '([-*_][ \\t]*){3,}$' + // '---' rule
    ')',
  'm'
);

const FENCE_RE = /^[ \t]*(`{3,}|~{3,})[ \t]*(.*)$/;
const FENCE_END_RE = /^[ \t]*(`{3,}|~{3,})[ \t]*$/;
const HR_RE = /^[ \t]*([-*_][ \t]*){3,}$/;
const HEADING_RE = /^[ \t]*(#{1,6})[ \t]+(.*)$/;
const QUOTE_RE = /^[ \t]*>[ \t]?(.*)$/;
const LIST_RE = new RegExp(
  `^([ \\t]*)([${BULLET_CHARS}]|\\d{1,9}[.)])[ \\t]+(.*)$`
);

interface ParsedItem {
  depth: number;
  ordered: boolean;
  start: number;
  text: string;
}

interface TreeItem {
  text: string;
  subs: TreeList[];
}

interface TreeList {
  ordered: boolean;
  start: number;
  items: TreeItem[];
}

const toListNode = (schema: Schema, list: TreeList): PMNode =>
  schema.nodes[list.ordered ? 'orderedList' : 'bulletList'].create(
    list.ordered ? { start: list.start } : {},
    list.items.map((item) =>
      schema.nodes.listItem.create({}, [
        schema.nodes.paragraph.create(
          {},
          item.text ? schema.text(item.text) : undefined
        ),
        ...item.subs.map((sub) => toListNode(schema, sub)),
      ])
    )
  );

// Two leading spaces (or a tab) per nesting level. A marker-type
// switch at a depth already in use ('1.' then '-', or back)
// closes the current list and opens a sibling under the same
// parent item — an ordered list can't hold bullet items.
const buildLists = (
  schema: Schema,
  items: ParsedItem[]
): PMNode[] => {
  const roots: TreeList[] = [];
  const stack: TreeList[] = [];
  // Last item added to stack[d] — the parent any new depth-(d+1)
  // or same-depth-different-marker list attaches to.
  const lastItemOf: (TreeItem | null)[] = [];
  const openList = (it: ParsedItem): TreeList => ({
    ordered: it.ordered,
    start: it.start,
    items: [],
  });
  for (const it of items) {
    let depth = Math.min(it.depth, stack.length);
    if (depth === stack.length) {
      // Deeper than every open list — valid only as a sub-list
      // of the deepest list's last item.
      const parent = stack.length
        ? lastItemOf[stack.length - 1]
        : null;
      if (parent) {
        const nested = openList(it);
        parent.subs.push(nested);
        stack.push(nested);
        lastItemOf.push(null);
      } else if (stack.length) {
        depth = stack.length - 1;
      }
    }
    if (depth === stack.length) {
      // stack was empty — open the first root list.
      const fresh = openList(it);
      roots.push(fresh);
      stack.push(fresh);
      lastItemOf.push(null);
    } else {
      stack.length = depth + 1;
      lastItemOf.length = depth + 1;
      if (stack[depth].ordered !== it.ordered) {
        const fresh = openList(it);
        const parent =
          depth === 0 ? null : lastItemOf[depth - 1];
        if (parent) {
          parent.subs.push(fresh);
        } else {
          roots.push(fresh);
        }
        stack[depth] = fresh;
        lastItemOf[depth] = null;
      }
    }
    const item: TreeItem = { text: it.text, subs: [] };
    stack[depth].items.push(item);
    lastItemOf[depth] = item;
  }
  return roots.map((list) => toListNode(schema, list));
};

const parseBlocks = (schema: Schema, text: string): PMNode[] => {
  const lines = text.split('\n');
  const blocks: PMNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const fence = line.match(FENCE_RE);
    if (fence) {
      const language = fence[2].trim() || null;
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE_END_RE.test(lines[i])) {
        buf.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1; // consume the closing fence
      blocks.push(
        schema.nodes.codeBlock.create(
          { language },
          buf.length ? schema.text(buf.join('\n')) : undefined
        )
      );
      continue;
    }
    if (HR_RE.test(line)) {
      blocks.push(schema.nodes.horizontalRule.create());
      i += 1;
      continue;
    }
    const heading = line.match(HEADING_RE);
    if (heading) {
      blocks.push(
        schema.nodes.heading.create(
          { level: heading[1].length },
          schema.text(heading[2].trimEnd())
        )
      );
      i += 1;
      continue;
    }
    if (QUOTE_RE.test(line)) {
      const paras: PMNode[] = [];
      while (i < lines.length) {
        const quoted = lines[i].match(QUOTE_RE);
        if (!quoted) break;
        paras.push(
          schema.nodes.paragraph.create(
            {},
            quoted[1] ? schema.text(quoted[1]) : undefined
          )
        );
        i += 1;
      }
      blocks.push(schema.nodes.blockquote.create({}, paras));
      continue;
    }
    if (LIST_RE.test(line)) {
      const items: ParsedItem[] = [];
      while (i < lines.length) {
        const item = lines[i].match(LIST_RE);
        if (item) {
          const indent = item[1].replace(/\t/g, '  ').length;
          items.push({
            depth: Math.floor(indent / 2),
            ordered: /\d/.test(item[2]),
            start: parseInt(item[2], 10) || 1,
            text: item[3].trimEnd(),
          });
          i += 1;
          continue;
        }
        const next = lines[i];
        if (!next.trim()) {
          // A blank line only ends the list when no further item
          // follows — a loose list (blank lines between items)
          // is still a single list in CommonMark.
          let j = i + 1;
          while (j < lines.length && !lines[j].trim()) j += 1;
          if (j < lines.length && LIST_RE.test(lines[j])) {
            i = j;
            continue;
          }
          break;
        }
        // An indented plain line continues the previous item.
        const indent = (next.match(/^[ \t]*/)?.[0] ?? '')
          .replace(/\t/g, '  ').length;
        if (items.length && indent >= 2) {
          items[items.length - 1].text += ` ${next.trim()}`;
          i += 1;
          continue;
        }
        break;
      }
      blocks.push(...buildLists(schema, items));
      continue;
    }
    blocks.push(
      schema.nodes.paragraph.create({}, schema.text(line.trim()))
    );
    i += 1;
  }
  return blocks;
};

/**
 * Converts block-level markdown in pasted plain text to schema
 * nodes. Returns null for ordinary prose so ProseMirror's
 * default text parsing runs (one paragraph per line).
 */
const parseMarkdownClipboard = (
  text: string,
  _context: ResolvedPos,
  _plain: boolean,
  view: EditorView
): Slice | null => {
  if (!MARKDOWN_BLOCK_RE.test(text)) return null;
  const blocks = parseBlocks(view.state.schema, text);
  if (!blocks.length) return null;
  // Note: parseFromClipboard re-opens slice edges via
  // Slice.maxOpen after this returns; the transformPasted hook
  // in clipboardSanitize clamps structural edges back shut so a
  // first heading/list can't merge into the cursor's paragraph.
  return new Slice(Fragment.from(blocks), 0, 0);
};

// PM's declared type demands a Slice return, but the runtime
// falls back to default parsing on a falsy result — the null
// returns above are intentional.
export const markdownClipboardParser =
  parseMarkdownClipboard as NonNullable<
    EditorProps['clipboardTextParser']
  >;

/**
 * HTML-clipboard fallback for markdown carried as plain DOM
 * text. Browsers serialize every copied selection to text/html;
 * a raw markdown document then arrives as <div>/<p> paragraphs
 * ('- item' stays literal text) and clipboardTextParser is
 * skipped entirely. When the whole pasted slice is unformatted
 * paragraphs and the recovered lines contain block markdown,
 * reparse them with the same block parser. Marks/links/images
 * in the slice veto the reparse so real rich text keeps its
 * formatting.
 */
export const markdownParagraphSlice = (
  slice: Slice,
  view: EditorView
): Slice | null => {
  const { content } = slice;
  if (!content.childCount) return null;
  let plain = true;
  content.forEach((node) => {
    if (node.type.name !== 'paragraph') {
      plain = false;
      return;
    }
    node.forEach((child) => {
      const bad = child.isText
        ? child.marks.length > 0
        : child.type.name !== 'hardBreak';
      if (bad) plain = false;
    });
  });
  if (!plain) return null;
  const text = content.textBetween(0, content.size, '\n', '\n');
  if (!MARKDOWN_BLOCK_RE.test(text)) return null;
  const blocks = parseBlocks(view.state.schema, text);
  return blocks.length
    ? new Slice(Fragment.from(blocks), 0, 0)
    : null;
};
