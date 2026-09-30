interface TiptapNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: TiptapNode[];
}

/**
 * Returns true when the stored string is a serialized TipTap doc
 * (JSON with type 'doc' and a content array).
 */
export const isTiptapDocString = (s: string): boolean => {
  try {
    const v = JSON.parse(s);
    return !!v && v.type === 'doc' && Array.isArray(v.content);
  } catch {
    return false;
  }
};

// Nodes that produce a line break after their content.
const BLOCK_TYPES = new Set([
  'doc',
  'paragraph',
  'heading',
  'blockquote',
  'bulletList',
  'orderedList',
  'listItem',
  'codeBlock',
  'horizontalRule',
]);

const collectText = (node: TiptapNode): string => {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  const inner = (node.content ?? []).map(collectText).join('');
  return node.type && BLOCK_TYPES.has(node.type) ? `${inner}\n` : inner;
};

/**
 * Extracts plain text from a serialized TipTap doc string:
 * concatenates text nodes, one '\n' per block node.
 */
export const docToPlainText = (s: string): string => {
  try {
    const doc = JSON.parse(s) as TiptapNode;
    return collectText(doc).replace(/\n+$/, '');
  } catch {
    return '';
  }
};

/**
 * Plain text regardless of storage format — doc-JSON is walked,
 * legacy plain-text values pass through unchanged.
 */
export const toPlainText = (s: string): string =>
  isTiptapDocString(s) ? docToPlainText(s) : s;
