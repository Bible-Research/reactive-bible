import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ContactModal from './ContactModal';
import { renderWithProviders } from '../__tests__/helpers';
import * as userReport from '../utils/userReport';

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
  document.querySelector('.mantine-Textarea-input') as HTMLElement;

const renderOnMobile = () => {
  const { rerender } = renderWithProviders(
    <ContactModal key="desktop" opened onClose={noop} />
  );
  mockMobileMatchMedia();
  act(() => {
    rerender(
      <ContactModal key="mobile" opened onClose={noop} />
    );
  });
};

describe('ContactModal', () => {
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
      <ContactModal opened onClose={noop} />
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
      screen.getByRole('button', { name: 'Send' })
    ).toBeEnabled();
  });

  it('defaults to a bug report and reframes per category',
    async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <ContactModal opened onClose={noop} />
      );

      // Bug is pre-selected: title, hint and textarea copy
      // all speak to a problem report.
      expect(
        screen.getByText('Report a problem')
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText('What went wrong?')
      ).toBeInTheDocument();

      await user.click(screen.getByText('Feature request'));
      expect(
        screen.getByText('Request a feature')
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText('What should the app do?')
      ).toBeInTheDocument();

      await user.click(screen.getByText('General message'));
      expect(
        screen.getByText('Message the developer')
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText('Your message')
      ).toBeInTheDocument();
    });

  it.each([
    ['Bug report', 'bug', 'What went wrong?'],
    ['Feature request', 'feature', 'What should the app do?'],
    ['General message', 'general', 'Your message'],
  ] as const)(
    'sends %s tagged %s',
    async (segment, category, fieldLabel) => {
      const send = vi
        .spyOn(userReport, 'sendUserReport')
        .mockReturnValue(true);
      const onClose = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <ContactModal opened onClose={onClose} />
      );

      if (category !== 'bug') {
        await user.click(screen.getByText(segment));
      }
      await user.type(
        screen.getByLabelText(fieldLabel),
        'a note'
      );
      await user.click(
        screen.getByRole('button', { name: 'Send' })
      );

      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({ category })
      );
      expect(onClose).toHaveBeenCalled();
    }
  );

  it('offers anonymous users an optional reply email',
    async () => {
      const send = vi
        .spyOn(userReport, 'sendUserReport')
        .mockReturnValue(true);
      const user = userEvent.setup();
      renderWithProviders(<ContactModal opened onClose={noop} />);

      const emailInput = screen.getByLabelText(
        'Email (optional — for a reply)'
      );
      await user.type(emailInput, 'reader@example.com');
      await user.type(
        screen.getByLabelText('What went wrong?'),
        'a note'
      );
      await user.click(
        screen.getByRole('button', { name: 'Send' })
      );

      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'reader@example.com',
        })
      );
    });

  it('keeps the typed note when sending fails', async () => {
    vi.spyOn(userReport, 'sendUserReport')
      .mockReturnValue(false);
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <ContactModal opened onClose={onClose} />
    );

    const field = screen.getByLabelText('What went wrong?');
    await user.type(field, 'do not lose this');
    await user.click(
      screen.getByRole('button', { name: 'Send' })
    );

    // The dialog stays open with the note intact so the user
    // can retry or copy it instead of retyping.
    expect(field).toHaveValue('do not lose this');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('hides the email field for signed-in users', () => {
    renderWithProviders(<ContactModal opened onClose={noop} />, {
      authStoreState: {
        isAuthenticated: true,
        token: 'test-token',
        user: { username: 'testuser' },
      },
    });

    expect(
      screen.queryByLabelText('Email (optional — for a reply)')
    ).not.toBeInTheDocument();
  });
});
