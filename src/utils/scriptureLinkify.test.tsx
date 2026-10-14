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

  it('keeps the ref anchor keyboard-focusable', () => {
    renderTokens('see @JHN.3.16 today');
    // href keeps the anchor focusable; preventDefault keeps
    // the click in-app (passage preview, no navigation).
    const link = screen.getByRole('link', {
      name: '@JHN.3.16',
    });
    expect(link).toHaveAttribute('href', '#');
  });

  it('renders an out-of-range ref as red plain text', () => {
    const { container } = renderTokens('@JHN.99.99');

    // No clickable link — the token renders as an inline span.
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('span')).not.toBeNull();
    expect(container.textContent).toBe('@JHN.99.99');
  });

  it('renders ref-shaped invalid tokens in red', () => {
    const { container } = renderTokens('bad @JHN.99.1 ref');
    const el = screen.getByText('@JHN.99.1');
    expect(el.tagName).toBe('SPAN');
    expect(el.closest('a')).toBeNull();
    expect(container.querySelectorAll('a')).toHaveLength(0);
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

  it('leaves @-handles as plain text too', () => {
    const { container } = renderTokens(
      'mail bob@example.com or @handle please'
    );
    expect(container.textContent).toContain('bob@example.com');
    expect(container.textContent).toContain('@handle');
    expect(container.querySelectorAll('a')).toHaveLength(0);
    // And not wrapped in the red invalid-ref span either.
    const red = [...container.querySelectorAll('span')].find(
      (s) => s.textContent === '@example.com'
    );
    expect(red).toBeUndefined();
  });

  it('splits trailing punctuation off a valid ref', () => {
    const { container } = renderTokens('@JHN.3.16.');

    const anchor = container.querySelector('a');
    expect(anchor?.textContent).toBe('@JHN.3.16');
    expect(container.textContent).toBe('@JHN.3.16.');
  });

  it('handles a verse range', () => {
    const { onGrab } = renderTokens('see @JHN.3.16-18');
    fireEvent.click(
      screen.getByRole('link', { name: '@JHN.3.16-18' })
    );
    expect(onGrab).toHaveBeenCalledWith('@JHN.3.16-18');
  });

  it('still tokenizes @ after whitespace and punctuation', () => {
    const { container } = renderTokens('(see @JHN.3.16)');
    expect(container.querySelector('a')?.textContent).toBe(
      '@JHN.3.16',
    );
  });
});
