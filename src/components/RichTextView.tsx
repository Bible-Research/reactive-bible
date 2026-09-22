import { Fragment } from 'react';
import type { ReactNode } from 'react';
import {
  Anchor,
  Box,
  Text,
  Title,
} from '@mantine/core';
import type { MantineSize } from '@mantine/core';
import { linkifyScripture } from '../utils/scriptureLinkify';
import { isTiptapDocString } from '../utils/tiptapContent';
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
  onScriptureRef: (ref: string) => void;
  size?: MantineSize;
}

const SAFE_LINK = /^(https?:|mailto:)/i;

const applyMarks = (
  node: TiptapNode,
  children: ReactNode,
  keyPrefix: string
): ReactNode => {
  let el: ReactNode = children;
  (node.marks ?? []).forEach((mark, i) => {
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

const RichTextView = ({
  content,
  onScriptureRef,
  size = 'md',
}: RichTextViewProps) => {
  // Wrap in a single element: callers mount this inside flex
  // containers (Stack/Group), where bare fragment children would
  // each become a flex item and links would drop to new lines.
  if (!isTiptapDocString(content)) {
    return (
      <Text component="div" size={size}>
        {linkifyScripture(content, onScriptureRef)}
      </Text>
    );
  }

  const doc = JSON.parse(content) as TiptapNode;

  const renderChildren = (
    node: TiptapNode,
    keyPrefix: string
  ): ReactNode[] =>
    (node.content ?? []).map((child, i) =>
      renderNode(child, `${keyPrefix}-${i}`)
    );

  const renderNode = (
    node: TiptapNode,
    key: string
  ): ReactNode => {
    switch (node.type) {
      case 'text':
        return (
          <Fragment key={key}>
            {applyMarks(
              node,
              linkifyScripture(node.text ?? '', onScriptureRef),
              key
            )}
          </Fragment>
        );
      case 'hardBreak':
        return <br key={key} />;
      case 'paragraph':
        return (
          <Text key={key} component="p" size={size} my={4}>
            {renderChildren(node, key)}
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
            {renderChildren(node, key)}
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
            {renderChildren(node, key)}
          </Box>
        );
      case 'bulletList':
        return (
          <Box key={key} component="ul" pl="lg" my={4}>
            {renderChildren(node, key)}
          </Box>
        );
      case 'orderedList':
        return (
          <Box key={key} component="ol" pl="lg" my={4}>
            {renderChildren(node, key)}
          </Box>
        );
      case 'listItem':
        return <li key={key}>{renderChildren(node, key)}</li>;
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
            <code>{renderChildren(node, key)}</code>
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
          <Anchor
            key={key}
            onClick={() => onScriptureRef(token)}
          >
            {label}
          </Anchor>
        );
      }
      default:
        // Unknown node: render children if any, never crash.
        if (node.content) {
          return (
            <Fragment key={key}>
              {renderChildren(node, key)}
            </Fragment>
          );
        }
        return null;
    }
  };

  return <Box>{renderChildren(doc, 'd')}</Box>;
};

export default RichTextView;
