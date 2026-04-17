import { Component, ReactNode } from 'react';
import { Container, Title, Text, Button, Stack } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
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
            <Button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.href = '/';
              }}
            >
              Go to Home
            </Button>
          </Stack>
        </Container>
      );
    }

    return this.props.children;
  }
}
