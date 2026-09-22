import type { ReactNode } from 'react';
import { Anchor } from '@mantine/core';

const SPLIT_REGEX = /(@[a-zA-Z0-9_+.:-]+)/g;
const VALID_REF_PREFIX =
  /^(@[a-zA-Z0-9+]+\.\d+[.:]\d+(?:-\d+)?)(.*)$/;

/**
 * Turns @-scripture references in text into clickable anchors.
 * Trailing punctuation (e.g. "@JHN.20.21." -> ".") is left as
 * plain text so references work mid-sentence.
 */
export const linkifyScripture = (
  text: string,
  onGrab: (hashtag: string) => void
): ReactNode[] => {
  const parts = text.split(SPLIT_REGEX);
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
    nodes.push(
      <Anchor key={i} onClick={() => onGrab(linkText)}>
        {linkText}
      </Anchor>
    );
    if (trailing) nodes.push(trailing);
  }

  return nodes;
};
