import { describe, it, expect, vi, beforeEach } from 'vitest';
import { showNotification } from '@mantine/notifications';
import { shareOrCopyLink } from './share';

vi.mock('@mantine/notifications', () => ({
  showNotification: vi.fn(),
}));

const mockNotify = vi.mocked(showNotification);

const content = {
  title: 'A title',
  text: 'Some text',
  url: 'https://example.com/shared',
};

const copySuccess = {
  title: 'Link Copied!',
  message: 'Link copied to clipboard',
};

const writeText = vi.fn().mockResolvedValue(undefined);

const setNavigator = (
  key: 'share' | 'clipboard',
  value: unknown
) =>
  Object.defineProperty(window.navigator, key, {
    value,
    configurable: true,
    writable: true,
  });

beforeEach(() => {
  vi.clearAllMocks();
  writeText.mockResolvedValue(undefined);
  setNavigator('share', undefined);
  setNavigator('clipboard', { writeText });
});

describe('shareOrCopyLink', () => {
  it('copies the url when the Web Share API is missing', async () => {
    await shareOrCopyLink(content, { copySuccess });

    expect(writeText).toHaveBeenCalledWith(content.url);
    expect(mockNotify).toHaveBeenCalledWith({
      ...copySuccess,
      color: 'blue',
    });
  });

  it('uses navigator.share when available and stays off ' +
    'the clipboard', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setNavigator('share', share);

    await shareOrCopyLink(content, { copySuccess });

    expect(share).toHaveBeenCalledWith(content);
    expect(writeText).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('shows the shareSuccess notification when configured',
    async () => {
      const share = vi.fn().mockResolvedValue(undefined);
      setNavigator('share', share);
      const shareSuccess = {
        title: 'Shared!',
        message: 'Link shared successfully',
      };

      await shareOrCopyLink(content, {
        copySuccess,
        shareSuccess,
      });

      expect(mockNotify).toHaveBeenCalledWith({
        ...shareSuccess,
        color: 'green',
      });
    });

  it('stays silent when the user cancels the share sheet',
    async () => {
      const abort = new Error('cancelled');
      abort.name = 'AbortError';
      setNavigator('share', vi.fn().mockRejectedValue(abort));

      await shareOrCopyLink(content, { copySuccess });

      expect(writeText).not.toHaveBeenCalled();
      expect(mockNotify).not.toHaveBeenCalled();
    });

  it('logs but does not copy on a non-abort share error by ' +
    'default', async () => {
    const error = new Error('share broke');
    setNavigator('share', vi.fn().mockRejectedValue(error));
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    await shareOrCopyLink(content, { copySuccess });

    expect(consoleSpy).toHaveBeenCalledWith(
      'Error sharing:',
      error
    );
    expect(writeText).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('falls back to the clipboard on a share error when ' +
    'clipboardOnShareError is set', async () => {
    setNavigator(
      'share',
      vi.fn().mockRejectedValue(new Error('share broke'))
    );
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await shareOrCopyLink(content, {
      copySuccess,
      clipboardOnShareError: true,
    });

    expect(writeText).toHaveBeenCalledWith(content.url);
    expect(mockNotify).toHaveBeenCalledWith({
      ...copySuccess,
      color: 'blue',
    });
    vi.restoreAllMocks();
  });

  it('shows copyFailure when the clipboard write fails and ' +
    'it is configured', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    const copyFailure = {
      title: 'Error',
      message: 'Failed to copy link',
    };
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await shareOrCopyLink(content, { copySuccess, copyFailure });

    expect(mockNotify).toHaveBeenCalledWith({
      ...copyFailure,
      color: 'red',
    });
    vi.restoreAllMocks();
  });

  it('only logs the clipboard error when copyFailure is ' +
    'omitted', async () => {
    const error = new Error('denied');
    writeText.mockRejectedValue(error);
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    await shareOrCopyLink(content, { copySuccess });

    expect(consoleSpy).toHaveBeenCalledWith(
      'Error copying to clipboard:',
      error
    );
    expect(mockNotify).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
