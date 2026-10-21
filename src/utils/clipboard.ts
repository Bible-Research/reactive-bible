/**
 * Copies text to the clipboard. `navigator.clipboard` requires a
 * secure context, so on http (and webviews where the API is
 * missing) this falls back to a hidden textarea + execCommand.
 * Returns false when neither path succeeds. `onError` receives
 * the clipboard-API rejection so callers that surface no
 * failure notification can still log the cause.
 */
export const copyTextToClipboard = async (
  text: string,
  onError?: (error: unknown) => void
): Promise<boolean> => {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      // Fall through to the legacy textarea path.
      onError?.(error);
    }
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    textarea.remove();
    return ok;
  } catch {
    return false;
  }
};
