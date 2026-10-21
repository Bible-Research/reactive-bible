import { Component, Fragment, memo, useMemo } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import {
  Anchor,
  Box,
  Text,
  Title,
} from '@mantine/core';
import type { MantineSize } from '@mantine/core';
import { linkifyScripture } from '../utils/scriptureLinkify';
import { toPlainText } from '../utils/tiptapContent';
import { BOOK_CODE_TO_NAME } from '../utils/bibleUtils';

interface TiptapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

interface TiptapNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: TiptapMark[];
  content?: TiptapNode[];
}

interface RichTextViewProps {
  /** Stored field value — TipTap doc-JSON or legacy plain text. */
  content: string;
  /** `anchorEl` is the clicked ref element — the popover
   *  positions itself under it. */
  onScriptureRef: (ref: string, anchorEl: HTMLElement) => void;
  size?: MantineSize;
}

const SAFE_LINK = /^(https?:|mailto:)/i;

// Rendered bodies are untrusted JSON (public comments render on
// public note pages). Bound the walk: non-array children/marks
// are dropped, recursion is depth-capped, and total nodes are
// capped so a crafted doc can't stack-overflow or hang render.
const MAX_RENDER_DEPTH = 64;
const MAX_RENDER_NODES = 5000;

interface RenderCtx {
  onRef: (ref: string, anchorEl: HTMLElement) => void;
  size: MantineSize;
  /** Remaining node budget — decremented per rendered node. */
  remaining: number;
}

const applyMarks = (
  node: TiptapNode,
  children: ReactNode,
  keyPrefix: string
): ReactNode => {
  let el: ReactNode = children;
  const marks = Array.isArray(node.marks) ? node.marks : [];
  marks.forEach((mark, i) => {
    if (!mark || typeof mark !== 'object') return;
    const key = `${keyPrefix}-m${i}`;
    switch (mark.type) {
      case 'bold':
        el = <strong key={key}>{el}</strong>;
        break;
      case 'italic':
        el = <em key={key}>{el}</em>;
        break;
      case 'underline':
        el = <u key={key}>{el}</u>;
        break;
      case 'strike':
        el = <s key={key}>{el}</s>;
        break;
      case 'code':
        el = <code key={key}>{el}</code>;
        break;
      case 'link': {
        const href = String(mark.attrs?.href ?? '');
        // Defense in depth: only http(s)/mailto links render.
        if (SAFE_LINK.test(href)) {
          el = (
            <Anchor
              key={key}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {el}
            </Anchor>
          );
        }
        break;
      }
      default:
        break;
    }
  });
  return el;
};

// Builds a '@USFM.C.V[-E]' token from a Phase-2 scriptureRef /
// mention node's attrs; falls back to the node's label.
const mentionToken = (node: TiptapNode): string | null => {
  const a = node.attrs ?? {};
  if (a.code && a.chapter && a.verseStart) {
    const end = a.verseEnd ? `-${a.verseEnd}` : '';
    return `@${a.code}.${a.chapter}.${a.verseStart}${end}`;
  }
  if (typeof a.id === 'string' && a.id.startsWith('@')) {
    return a.id;
  }
  if (typeof a.label === 'string' && a.label.startsWith('@')) {
    return a.label;
  }
  return null;
};

const renderChildren = (
  node: TiptapNode,
  keyPrefix: string,
  depth: number,
  ctx: RenderCtx
): ReactNode[] => {
  const children = Array.isArray(node.content)
    ? node.content
    : [];
  return children.map((child, i) =>
    renderNode(child, `${keyPrefix}-${i}`, depth + 1, ctx)
  );
};

const renderNode = (
  node: TiptapNode,
  key: string,
  depth: number,
  ctx: RenderCtx
): ReactNode => {
  // Guard every entry: malformed children and over-deep or
  // over-large docs degrade to nothing instead of throwing.
  if (
    ctx.remaining <= 0 ||
    depth > MAX_RENDER_DEPTH ||
    node === null ||
    typeof node !== 'object'
  ) {
    return null;
  }
  ctx.remaining -= 1;
  const kids = (prefix: string) =>
    renderChildren(node, prefix, depth, ctx);
  switch (node.type) {
    case 'text':
      return (
        <Fragment key={key}>
          {applyMarks(
            node,
            linkifyScripture(
              typeof node.text === 'string' ? node.text : '',
              ctx.onRef
            ),
            key
          )}
        </Fragment>
      );
    case 'hardBreak':
      return <br key={key} />;
    case 'paragraph':
      return (
        <Text key={key} component="p" size={ctx.size} my={4}>
          {kids(key)}
        </Text>
      );
    case 'heading': {
      const level = Number(node.attrs?.level) || 1;
      const order = Math.min(Math.max(level, 1), 6) as
        | 1
        | 2
        | 3
        | 4
        | 5
        | 6;
      return (
        <Title key={key} order={order} my={4}>
          {kids(key)}
        </Title>
      );
    }
    case 'blockquote':
      return (
        <Box
          key={key}
          component="blockquote"
          sx={(theme) => ({
            margin: `${theme.spacing.xs} 0`,
            paddingLeft: theme.spacing.md,
            borderLeft: `3px solid ${
              theme.colorScheme === 'dark'
                ? theme.colors.dark[4]
                : theme.colors.gray[4]
            }`,
          })}
        >
          {kids(key)}
        </Box>
      );
    case 'bulletList':
      return (
        <Box key={key} component="ul" pl="lg" my={4}>
          {kids(key)}
        </Box>
      );
    case 'orderedList':
      return (
        <Box key={key} component="ol" pl="lg" my={4}>
          {kids(key)}
        </Box>
      );
    case 'listItem':
      return <li key={key}>{kids(key)}</li>;
    case 'codeBlock':
      return (
        <Box
          key={key}
          component="pre"
          p="xs"
          sx={(theme) => ({
            backgroundColor:
              theme.colorScheme === 'dark'
                ? theme.colors.dark[6]
                : theme.colors.gray[1],
            borderRadius: theme.radius.sm,
            overflowX: 'auto',
          })}
        >
          <code>{kids(key)}</code>
        </Box>
      );
    case 'horizontalRule':
      return <hr key={key} />;
    case 'scriptureRef':
    case 'mention': {
      const token = mentionToken(node);
      if (!token) return null;
      const bookName = BOOK_CODE_TO_NAME[
        String(node.attrs?.code ?? '')
      ];
      const label =
        typeof node.attrs?.label === 'string' &&
        node.attrs.label
          ? node.attrs.label
          : bookName
          ? `${bookName} ${node.attrs?.chapter}:${node.attrs
              ?.verseStart}${
              node.attrs?.verseEnd
                ? `-${node.attrs.verseEnd}`
                : ''
            }`
          : token;
      return (
        // href keeps the anchor keyboard-focusable; the click
        // stays in-app (opens the passage preview). The
        // data-scripture-ref attribute matches what the
        // editor's ScriptureRefNode emits — the popover's
        // tap-outside dismissal skips presses on it.
        <Anchor
          key={key}
          href="#"
          data-scripture-ref=""
          onClick={(e) => {
            e.preventDefault();
            ctx.onRef(token, e.currentTarget);
          }}
        >
          {label}
        </Anchor>
      );
    }
    default:
      // Unknown node: render children if any, never crash.
      return <Fragment key={key}>{kids(key)}</Fragment>;
  }
};

// Parses the stored value once. Returns the doc node when it is
// serialized TipTap doc-JSON, null for legacy plain text (and
// for JSON that isn't a well-formed doc).
const parseDoc = (content: string): TiptapNode | null => {
  try {
    const v = JSON.parse(content) as TiptapNode;
    return !!v &&
      v.type === 'doc' &&
      Array.isArray(v.content)
      ? v
      : null;
  } catch {
    return null;
  }
};

// Renders the parsed doc or the legacy plain-text path. Kept as
// a child of the error boundary so a throw here — even inside
// useMemo — is caught and degraded per comment, not per page.
const RichTextBody = memo(
  ({ content, onScriptureRef, size = 'md' }: RichTextViewProps) => {
    const body = useMemo(() => {
      const doc = parseDoc(content);
      // Wrap in a single element: callers mount this inside
      // flex containers (Stack/Group), where bare fragment
      // children would each become a flex item and links wrap.
      if (!doc) {
        return (
          <Text component="div" size={size}>
            {linkifyScripture(content, onScriptureRef)}
          </Text>
        );
      }
      const ctx: RenderCtx = {
        onRef: onScriptureRef,
        size,
        remaining: MAX_RENDER_NODES,
      };
      return <Box>{renderChildren(doc, 'd', 0, ctx)}</Box>;
    }, [content, onScriptureRef, size]);
    return <>{body}</>;
  }
);

// Last-resort render if the guarded walker still throws: plain
// text with scripture linkification, never a blank page.
const PlainFallback = ({
  content,
  onScriptureRef,
  size = 'md',
}: RichTextViewProps) => (
  <Text component="div" size={size}>
    {linkifyScripture(toPlainText(content), onScriptureRef)}
  </Text>
);

interface BoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
}

interface BoundaryState {
  hasError: boolean;
}

// Error boundaries must be classes (no hook equivalent); this
// one is scoped to a single rendered body so one crafted doc
// can't take down the whole public note page.
class RichTextErrorBoundary extends Component<
  BoundaryProps,
  BoundaryState
> {
  state: BoundaryState = { hasError: false };

  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('RichTextView render error:', error, info);
  }

  render() {
    return this.state.hasError
      ? this.props.fallback
      : this.props.children;
  }
}

const RichTextView = (props: RichTextViewProps) => {
  const { content, onScriptureRef, size = 'md' } = props;
  return (
    // keyed on content: a new value resets a tripped boundary.
    <RichTextErrorBoundary
      key={content}
      fallback={
        <PlainFallback
          content={content}
          onScriptureRef={onScriptureRef}
          size={size}
        />
      }
    >
      <RichTextBody {...props} />
    </RichTextErrorBoundary>
  );
};

const MemoizedRichTextView = memo(RichTextView);
export default MemoizedRichTextView;
