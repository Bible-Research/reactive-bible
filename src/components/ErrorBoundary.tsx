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
import { copyErrorDetails } from '../utils/errorReportDetails';
import { reportError } from '../utils/errorReporter';

interface Props {
  children: ReactNode;
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

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, copied: false };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    reportError(error, 'React render error');
  }

  render() {
    if (this.state.hasError) {
      return (
        <Container size="sm" mt={100}>
          <Stack align="center" spacing="lg">
            <IconAlertTriangle size={64} color="red" />
            <Title order={2}>Something went wrong</Title>
            <Text color="dimmed" align="center">
              {this.state.error?.message ||
                'An unexpected error occurred. Please try again.'}
            </Text>
            <Group>
              <Button
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.href = '/';
                }}
              >
                Go to Home
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
                  ? 'Copied!'
                  : 'Copy error details'}
              </Button>
            </Group>
            <Text size="xs" color="dimmed" align="center">
              Please report this bug by pasting the details into a
              GitHub issue.
            </Text>
          </Stack>
        </Container>
      );
    }

    return this.props.children;
  }
}
