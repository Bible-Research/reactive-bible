/**
 * Builds a markdown-formatted error report that can be pasted
 * directly into a GitHub issue.
 */
export function buildErrorDetails(
  error: Error,
  context?: string
): string {
  const header = context
    ? `**Error (${context}):** ${error.name}: ${error.message}`
    : `**Error:** ${error.name}: ${error.message}`;
  return [
    header,
    `**URL:** ${window.location.href}`,
    `**Time:** ${new Date().toISOString()}`,
    `**User agent:** ${navigator.userAgent}`,
    '',
    '```',
    error.stack || 'No stack trace available',
    '```',
  ].join('\n');
}

/**
 * Copies the markdown error report to the clipboard.
 * Returns true on success.
 */
export async function copyErrorDetails(
  error: Error,
  context?: string
): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(
      buildErrorDetails(error, context)
    );
    return true;
  } catch {
    return false;
  }
}
