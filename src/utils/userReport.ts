import * as Sentry from '@sentry/react';

/**
 * User-submitted messages ("Contact developer" in the main
 * menu). Unlike `reportError` — which forwards unhandled
 * exceptions — these are deliberate messages typed by the
 * user: a `user report (<category>)…` message event tagged
 * `reportType: user-report` and
 * `reportCategory: bug|feature|general`,
 * plus a Sentry user-feedback entry linked via
 * `associatedEventId`, so the note also surfaces in Sentry's
 * User Feedback view. Triage consumes `reportCategory` to
 * keep bugs separate from feature requests and general mail.
 *
 * Like `reportError`, this is safe to call anywhere: with no
 * DSN there is no client and it returns false; it never throws.
 */

export type ReportCategory = 'bug' | 'feature' | 'general';

export interface UserReportContext {
  bookId?: string;
  chapter?: number;
  textFilesetId?: string | null;
  audioFilesetId?: string | null;
}

export interface UserReport {
  message: string;
  username?: string;
  category?: ReportCategory;
  email?: string;
  context?: UserReportContext;
}

const FLUSH_TIMEOUT_MS = 5000;

export const sendUserReport = (report: UserReport): boolean => {
  try {
    const message = report.message.trim();
    if (!message || !Sentry.getClient()) return false;
    const category = report.category ?? 'bug';
    const tags = {
      reportType: 'user-report',
      reportCategory: category,
    };
    let eventId: string | undefined;
    Sentry.withScope((scope) => {
      scope.setContext('userReport', {
        note: message,
        category,
        ...(report.username
          ? { reportedBy: report.username }
          : {}),
        ...report.context,
      });
      // Sentry's built-in Dedupe integration drops an untyped
      // event that is identical (message + fingerprint + stack)
      // to the previous one — and every report shares this call
      // site's synthetic stack, so back-to-back reports were
      // silently dropped as duplicates of the first. Putting
      // the report's own category/passage/text in the message
      // makes distinct reports distinct (a byte-identical
      // resend still collapses — the feedback entry survives
      // either way), while the constant fingerprint keeps all
      // of them grouped under the single stream issue.
      scope.setFingerprint(['user-report']);
      const ctx = report.context;
      const passage = ctx?.bookId
        ? ` ${ctx.bookId}.${ctx.chapter ?? '?'}`
        : '';
      eventId = Sentry.captureMessage(
        `user report (${category})${passage}: ${message}`,
        {
          level: 'info',
          tags,
        },
      );
    });
    try {
      Sentry.captureFeedback({
        message,
        ...(report.username ? { name: report.username } : {}),
        ...(report.email ? { email: report.email } : {}),
        source: 'menu-report',
        associatedEventId: eventId,
        tags,
      });
    } catch {
      // A failed feedback call must not fail the report.
    }
    void Sentry.flush(FLUSH_TIMEOUT_MS).catch(() => undefined);
    return true;
  } catch {
    return false;
  }
};
