import * as Sentry from '@sentry/react';

/**
 * User-submitted problem reports ("Report a problem" in the
 * main menu). Unlike `reportError` — which forwards unhandled
 * exceptions — these are deliberate reports typed by the user:
 * a `user report` message event tagged `reportType:
 * user-report`, plus a Sentry user-feedback entry linked via
 * `associatedEventId`, so the note also surfaces in Sentry's
 * User Feedback view.
 *
 * Like `reportError`, this is safe to call anywhere: with no
 * DSN there is no client and it returns false; it never throws.
 */

export interface UserReportContext {
  bookId?: string;
  chapter?: number;
  textFilesetId?: string | null;
  audioFilesetId?: string | null;
}

export interface UserReport {
  message: string;
  username?: string;
  context?: UserReportContext;
}

const FLUSH_TIMEOUT_MS = 5000;

export const sendUserReport = (report: UserReport): boolean => {
  try {
    const message = report.message.trim();
    if (!message || !Sentry.getClient()) return false;
    let eventId: string | undefined;
    Sentry.withScope((scope) => {
      scope.setContext('userReport', {
        note: message,
        ...(report.username
          ? { reportedBy: report.username }
          : {}),
        ...report.context,
      });
      eventId = Sentry.captureMessage('user report', {
        level: 'info',
        tags: { reportType: 'user-report' },
      });
    });
    try {
      Sentry.captureFeedback({
        message,
        ...(report.username ? { name: report.username } : {}),
        source: 'menu-report',
        associatedEventId: eventId,
        tags: { reportType: 'user-report' },
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
