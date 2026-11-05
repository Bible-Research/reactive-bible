import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ReportProblemModal from './ReportProblemModal';
import { renderWithProviders } from '../__tests__/helpers';

const MOBILE_QUERY = '(max-width: 768px)';
const noop = () => { /* noop */ };

// renderWithProviders installs an always-false matchMedia
// mock, so the mobile mock must be applied after render and
// the component remounted (new key) to re-run the media query.
const mockMobileMatchMedia = () => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === MOBILE_QUERY,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
};

const modalContent = () =>
  document.querySelector('.mantine-Modal-content') as HTMLElement;
const modalBody = () =>
  document.querySelector('.mantine-Modal-body') as HTMLElement;
const textareaInput = () =>
  document.querySelector('.mantine-Input-input') as HTMLElement;

const renderOnMobile = () => {
  const { rerender } = renderWithProviders(
    <ReportProblemModal key="desktop" opened onClose={noop} />
  );
  mockMobileMatchMedia();
  act(() => {
    rerender(
      <ReportProblemModal key="mobile" opened onClose={noop} />
    );
  });
};

describe('ReportProblemModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('goes full-screen with a stretched input on mobile', () => {
    renderOnMobile();

    // Mantine fullScreen => content takes 100% of the inner.
    const content = modalContent();
    expect(getComputedStyle(content).flex).toBe('0 0 100%');
    expect(getComputedStyle(content).flexDirection).toBe(
      'column'
    );

    // The body and the textarea grow to fill that space so
    // the box is comfortable to type in on a phone.
    expect(getComputedStyle(modalBody()).flex).toBe('1 1 0%');
    expect(getComputedStyle(textareaInput()).flex).toBe(
      '1 1 0%'
    );
  });

  it('stays a regular centered dialog on desktop', () => {
    renderWithProviders(
      <ReportProblemModal opened onClose={noop} />
    );

    expect(getComputedStyle(modalContent()).flex).not.toBe(
      '0 0 100%'
    );
  });

  it('still accepts a report on the mobile layout', async () => {
    const user = userEvent.setup();
    renderOnMobile();

    await user.type(
      screen.getByLabelText('What went wrong?'),
      'the next button does nothing'
    );

    expect(
      screen.getByRole('button', { name: 'Send report' })
    ).toBeEnabled();
  });
});
