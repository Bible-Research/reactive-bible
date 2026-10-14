/**
 * Copies text to the clipboard. `navigator.clipboard` requires a
 * secure context, so on http (and webviews where the API is
 * missing) this falls back to a hidden textarea + execCommand.
 * Returns false when neither path succeeds.
 */
export const copyTextToClipboard = async (
  text: string
): Promise<boolean> => {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the legacy textarea path.
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
