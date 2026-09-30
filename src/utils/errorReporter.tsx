import { showNotification } from '@mantine/notifications';
import {
  ErrorNotificationContent,
} from '../components/ErrorNotificationContent';

const NOTIFICATION_ID = 'unhandled-error';

const RESOURCE_TAGS = ['IMG', 'SCRIPT', 'LINK', 'AUDIO', 'VIDEO'];

function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  if (typeof error === 'string') {
    return new Error(error);
  }
  try {
    return new Error(JSON.stringify(error));
  } catch {
    return new Error(String(error));
  }
}

/**
 * Surfaces an error to the user via a non-dismissible
 * notification containing a "Copy error details" button.
 */
export function reportError(error: unknown, context?: string): void {
  const err = toError(error);
  try {
    console.error(
      context ? `[${context}]` : '[Unexpected error]',
      err
    );
    showNotification({
      id: NOTIFICATION_ID,
      title: 'Unexpected error',
      message: (
        <ErrorNotificationContent error={err} context={context} />
      ),
      color: 'red',
      autoClose: false,
    });
  } catch (reportingError) {
    // Never let error reporting itself throw inside a global
    // error handler.
    console.error('Failed to report error:', reportingError);
  }
}

function handleGlobalError(event: Event): void {
  if ('error' in event || 'message' in event) {
    const errorEvent = event as ErrorEvent;
    if (errorEvent.error) {
      reportError(errorEvent.error);
    } else if (errorEvent.message) {
      reportError(new Error(errorEvent.message));
    }
    return;
  }
  // Resource load failures (img/script/audio/...) arrive as plain
  // Events with the failing element as target (capture phase).
  const target = event.target;
  if (
    target instanceof HTMLElement &&
    RESOURCE_TAGS.includes(target.tagName)
  ) {
    const src =
      (target as HTMLImageElement).src ||
      (target as HTMLLinkElement).href ||
      target.tagName.toLowerCase();
    reportError(
      new Error(`Failed to load resource: ${src}`),
      'Resource load error'
    );
  }
}

function handleUnhandledRejection(
  event: PromiseRejectionEvent
): void {
  reportError(event.reason, 'Unhandled promise rejection');
}

/**
 * Installs window-level handlers for uncaught exceptions,
 * unhandled promise rejections, and resource load failures.
 * Returns a cleanup function that removes the listeners.
 */
export function initGlobalErrorHandlers(): () => void {
  window.addEventListener('error', handleGlobalError, true);
  window.addEventListener(
    'unhandledrejection',
    handleUnhandledRejection
  );
  return () => {
    window.removeEventListener('error', handleGlobalError, true);
    window.removeEventListener(
      'unhandledrejection',
      handleUnhandledRejection
    );
  };
}
