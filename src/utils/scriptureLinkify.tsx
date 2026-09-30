import type { ReactNode } from 'react';
import { Anchor, Text } from '@mantine/core';
import { isValidScriptureToken } from './scriptureMention';

export const SCRIPTURE_TOKEN_REGEX = /(@[a-zA-Z0-9_+.:-]+)/g;
export const VALID_REF_PREFIX =
  /^(@[a-zA-Z0-9+]+\.\d+[.:]\d+(?:-\d+)?)(.*)$/;

/**
 * Turns @-scripture references in text into clickable anchors.
 * Tokens that don't resolve to a complete, in-range ref render
 * in red instead of a dead link. Trailing punctuation (e.g.
 * "@JHN.20.21." -> ".") is left as plain text so references
 * work mid-sentence.
 */
export const linkifyScripture = (
  text: string,
  onGrab: (hashtag: string) => void
): ReactNode[] => {
  const parts = text.split(SCRIPTURE_TOKEN_REGEX);
  const nodes: ReactNode[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part.startsWith('@')) {
      nodes.push(part);
      continue;
    }
    const refMatch = part.match(VALID_REF_PREFIX);
    const linkText = refMatch ? refMatch[1] : part;
    const trailing = refMatch ? refMatch[2] : '';
    if (!isValidScriptureToken(linkText)) {
      nodes.push(
        <Text key={i} component="span" color="red">
          {linkText}
        </Text>
      );
      if (trailing) nodes.push(trailing);
      continue;
    }
    nodes.push(
      <Anchor key={i} onClick={() => onGrab(linkText)}>
        {linkText}
      </Anchor>
    );
    if (trailing) nodes.push(trailing);
  }

  return nodes;
};
