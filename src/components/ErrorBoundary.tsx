import { Component, ErrorInfo, ReactNode } from 'react';
import {
  Button,
  Container,
  Group,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import * as Sentry from '@sentry/react';
import { copyErrorDetails } from '../utils/errorReportDetails';
import { reportError } from '../utils/errorReporter';
import { textOrKey } from '../i18n/errorText';
import i18n from '../i18n';

interface Props {
  children: ReactNode;
  /** When this value changes while the boundary is in the
   *  error state, the boundary recovers. Healthy children are
   *  never remounted — the check only fires post-error.
   *  Pass the current pathname so intra-section navigation
   *  (e.g. /notes -> /notes/:id) clears a stuck fallback. */
  resetKey?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, copied: false };
  }

  componentDidMount(): void {
    i18n.on('languageChanged', this.handleLanguageChange);
  }

  componentWillUnmount(): void {
    i18n.off('languageChanged', this.handleLanguageChange);
  }

  // The fallback renders outside the React tree's translation
  // context — re-render so its i18n.t calls resolve in the new
  // language when the user switches from MainMenu.
  private handleLanguageChange = (): void => {
    this.forceUpdate();
  };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, copied: false };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    // Sent before reportError's own captureException so the
    // event that survives Sentry's dedupe carries the React
    // component stack — and the `context` tag, which the
    // deduped second capture would otherwise lose. No-op when
    // Sentry is not initialized.
    Sentry.captureException(error, {
      tags: { context: 'React render error' },
      extra: { componentStack: errorInfo.componentStack },
    });
    reportError(error, 'React render error');
  }

  componentDidUpdate(prevProps: Props) {
    if (
      this.state.hasError &&
      prevProps.resetKey !== this.props.resetKey
    ) {
      this.setState({ hasError: false, error: null, copied: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <Container size="sm" mt={100}>
          <Stack align="center" spacing="lg">
            <IconAlertTriangle size={64} color="red" />
            <Title order={2}>{i18n.t('errorBoundary.title')}</Title>
            <Text color="dimmed" align="center">
              {textOrKey(
                this.state.error?.message ||
                  'errorBoundary.unexpected'
              )}
            </Text>
            <Group>
              <Button
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.href = '/';
                }}
              >
                {i18n.t('errorBoundary.goHome')}
              </Button>
              <Button
                variant="light"
                onClick={() => {
                  if (!this.state.error) {
                    return;
                  }
                  void copyErrorDetails(
                    this.state.error,
                    'React render error'
                  ).then((copied) => this.setState({ copied }));
                }}
              >
                {this.state.copied
                  ? i18n.t('errorBoundary.copied')
                  : i18n.t('errorBoundary.copyDetails')}
              </Button>
            </Group>
            <Text size="xs" color="dimmed" align="center">
              {i18n.t('errorBoundary.reportHint')}
            </Text>
          </Stack>
        </Container>
      );
    }

    return this.props.children;
  }
}
