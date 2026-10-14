import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { linkifyScripture } from './scriptureLinkify';

const renderTokens = (text: string, onGrab = vi.fn()) => {
  const utils = render(<div>{linkifyScripture(text, onGrab)}</div>);
  return { ...utils, onGrab };
};

describe('linkifyScripture', () => {
  it('renders a valid ref as a clickable anchor', () => {
    const { onGrab } = renderTokens('See @JHN.3.16 now');

    const anchor = screen.getByText('@JHN.3.16');
    expect(anchor.tagName).toBe('A');

    fireEvent.click(anchor);
    expect(onGrab).toHaveBeenCalledWith('@JHN.3.16');
  });

  it('renders an out-of-range ref as red plain text', () => {
    const { container } = renderTokens('@JHN.99.99');

    // No clickable link — the token renders as an inline span.
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('span')).not.toBeNull();
    expect(container.textContent).toBe('@JHN.99.99');
  });

  it('leaves an email address as plain text', () => {
    const { container, onGrab } = renderTokens(
      'mail me@example.com today',
    );

    // The `@` inside an email is not a scripture-token boundary:
    // no anchor, no red invalid-ref span, one text node.
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('span')).toBeNull();
    expect(container.textContent).toBe('mail me@example.com today');

    fireEvent.click(container.firstElementChild as HTMLElement);
    expect(onGrab).not.toHaveBeenCalled();
  });

  it('splits trailing punctuation off a valid ref', () => {
    const { container } = renderTokens('@JHN.3.16.');

    const anchor = container.querySelector('a');
    expect(anchor?.textContent).toBe('@JHN.3.16');
    expect(container.textContent).toBe('@JHN.3.16.');
  });

  it('still tokenizes @ after whitespace and punctuation', () => {
    const { container } = renderTokens('(see @JHN.3.16)');
    expect(container.querySelector('a')?.textContent).toBe(
      '@JHN.3.16',
    );
  });
});
