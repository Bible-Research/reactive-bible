import { showNotification } from '@mantine/notifications';

/** Payload handed to the Web Share API / clipboard fallback. */
export interface ShareContent {
  title: string;
  text: string;
  url: string;
}

export interface ShareMessage {
  title: string;
  message: string;
}

export interface ShareLinkOptions {
  /** Shown after a successful `navigator.share`; omit to stay
   *  silent on share success. */
  shareSuccess?: ShareMessage;
  /** Shown after the URL lands on the clipboard. */
  copySuccess: ShareMessage;
  /** Shown when the clipboard write fails; omit to only log
   *  the error. */
  copyFailure?: ShareMessage;
  /** Retry via the clipboard when `navigator.share` rejects
   *  for a non-abort reason (NoteCard behavior). Default: the
   *  share error is only logged. */
  clipboardOnShareError?: boolean;
}

/**
 * Shares a link via the Web Share API, falling back to a
 * clipboard copy when the API is unavailable (desktop
 * browsers). A user dismissing the share sheet (AbortError)
 * is always silent. Notification wording is caller-supplied
 * so each surface keeps its existing copy.
 */
export const shareOrCopyLink = async (
  content: ShareContent,
  options: ShareLinkOptions
): Promise<void> => {
  if (navigator.share) {
    try {
      await navigator.share(content);
      if (options.shareSuccess) {
        showNotification({
          ...options.shareSuccess,
          color: 'green',
        });
      }
      return;
    } catch (err) {
      // User cancelled the share sheet — stay silent.
      if ((err as Error).name === 'AbortError') return;
      console.error('Error sharing:', err);
      if (!options.clipboardOnShareError) return;
    }
  }

  try {
    await navigator.clipboard.writeText(content.url);
    showNotification({ ...options.copySuccess, color: 'blue' });
  } catch (err) {
    console.error('Error copying to clipboard:', err);
    if (options.copyFailure) {
      showNotification({ ...options.copyFailure, color: 'red' });
    }
  }
};
