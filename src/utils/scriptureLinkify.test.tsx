import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { linkifyScripture } from './scriptureLinkify';

const renderNodes = (text: string, onGrab = vi.fn()) => {
  const utils = render(<div>{linkifyScripture(text, onGrab)}</div>);
  return { ...utils, onGrab };
};

describe('linkifyScripture', () => {
  it('linkifies a valid ref with a focusable anchor', () => {
    const onGrab = vi.fn();
    renderNodes('see @JHN.3.16 today', onGrab);
    const link = screen.getByRole('link', {
      name: '@JHN.3.16',
    });
    // Keyboard-focusable: href present, click stays in-app.
    expect(link).toHaveAttribute('href', '#');
    fireEvent.click(link);
    expect(onGrab).toHaveBeenCalledWith('@JHN.3.16');
  });

  it('renders ref-shaped invalid tokens in red', () => {
    const { container } = renderNodes('bad @JHN.99.1 ref');
    const el = screen.getByText('@JHN.99.1');
    expect(el.tagName).toBe('SPAN');
    expect(el.closest('a')).toBeNull();
    expect(container.querySelectorAll('a')).toHaveLength(0);
  });

  it('leaves emails and @-handles as plain text', () => {
    const { container } = renderNodes(
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

  it('keeps trailing punctuation outside the link', () => {
    renderNodes('read @JHN.3.16.');
    const link = screen.getByRole('link', {
      name: '@JHN.3.16',
    });
    expect(link.nextSibling?.textContent).toBe('.');
  });

  it('handles a verse range', () => {
    const onGrab = vi.fn();
    renderNodes('see @JHN.3.16-18', onGrab);
    fireEvent.click(
      screen.getByRole('link', { name: '@JHN.3.16-18' })
    );
    expect(onGrab).toHaveBeenCalledWith('@JHN.3.16-18');
  });
});
