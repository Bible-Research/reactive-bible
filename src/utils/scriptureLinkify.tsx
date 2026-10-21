import { Fragment } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { Anchor, Text } from '@mantine/core';
import { isValidScriptureToken } from './scriptureMention';

// The `@` must not be preceded by a word char — otherwise the
// `@` inside an email like `me@example.com` starts a token and
// the address renders as a bogus red invalid-ref span.
export const SCRIPTURE_TOKEN_REGEX =
  /(?<!\w)(@[a-zA-Z0-9_+.:-]+)/g;
export const VALID_REF_PREFIX =
  /^(@[a-zA-Z0-9+]+\.\d+[.:]\d+(?:-\d+)?)(.*)$/;

// Only '@book.digit…' shapes count as ref attempts — plain
// @-handles and emails ('bob@example.com') stay neutral text
// instead of being flagged red.
const REF_ATTEMPT_REGEX = /^@[a-zA-Z0-9+]+\.\d/;

/**
 * True when a '@…' token at least starts like a scripture ref
 * (book segment, '.', digit). Anything else is ordinary text.
 */
export const isRefAttempt = (token: string): boolean =>
  REF_ATTEMPT_REGEX.test(token);

const grab = (
  e: MouseEvent<HTMLAnchorElement>,
  onGrab: (hashtag: string, anchorEl: HTMLAnchorElement) => void,
  hashtag: string
): void => {
  e.preventDefault();
  // The clicked element becomes the popover's anchor.
  onGrab(hashtag, e.currentTarget);
};

/**
 * Turns @-scripture references in text into clickable anchors.
 * Tokens shaped like refs that don't resolve to a complete,
 * in-range ref render in red instead of a dead link. Trailing
 * punctuation (e.g. "@JHN.20.21." -> ".") is left as plain text
 * so references work mid-sentence.
 */
export const linkifyScripture = (
  text: string,
  onGrab: (hashtag: string, anchorEl: HTMLAnchorElement) => void
): ReactNode[] => {
  const parts = text.split(SCRIPTURE_TOKEN_REGEX);
  const nodes: ReactNode[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part.startsWith('@')) {
      nodes.push(<Fragment key={i}>{part}</Fragment>);
      continue;
    }
    const refMatch = part.match(VALID_REF_PREFIX);
    const linkText = refMatch ? refMatch[1] : part;
    const trailing = refMatch ? refMatch[2] : '';
    // Not ref-shaped (@-handles, emails): render untouched.
    if (!isRefAttempt(linkText)) {
      nodes.push(<Fragment key={i}>{part}</Fragment>);
      continue;
    }
    if (!isValidScriptureToken(linkText)) {
      nodes.push(
        <Text key={i} component="span" color="red">
          {linkText}
        </Text>
      );
      if (trailing) {
        nodes.push(<Fragment key={`${i}-t`}>{trailing}</Fragment>);
      }
      continue;
    }
    // href keeps the anchor keyboard-focusable; preventDefault
    // keeps the click in-app (passage preview, no navigation).
    // data-scripture-ref marks the element for the popover's
    // tap-outside dismissal, which skips presses on ref anchors.
    nodes.push(
      <Anchor
        key={i}
        href="#"
        data-scripture-ref=""
        onClick={(e) => grab(e, onGrab, linkText)}
      >
        {linkText}
      </Anchor>
    );
    if (trailing) {
      nodes.push(<Fragment key={`${i}-t`}>{trailing}</Fragment>);
    }
  }

  return nodes;
};
