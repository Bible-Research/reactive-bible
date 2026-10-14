import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { showNotification } from '@mantine/notifications';
import { ErrorBoundary } from '../ErrorBoundary';

vi.mock('@mantine/notifications', () => ({
  showNotification: vi.fn(),
}));

function ThrowingChild(): JSX.Element {
  throw new Error('render exploded');
}

describe('ErrorBoundary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders children when nothing throws', () => {
    render(
      <MantineProvider>
        <ErrorBoundary>
          <div>all good</div>
        </ErrorBoundary>
      </MantineProvider>
    );

    expect(screen.getByText('all good')).toBeInTheDocument();
  });

  it('shows fallback and reports error when a child throws', () => {
    vi.spyOn(console, 'error').mockImplementation(
      () => undefined
    );

    render(
      <MantineProvider>
        <ErrorBoundary>
          <ThrowingChild />
        </ErrorBoundary>
      </MantineProvider>
    );

    expect(
      screen.getByText('Something went wrong')
    ).toBeInTheDocument();
    expect(
      screen.getByText('render exploded')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Copy error details')
    ).toBeInTheDocument();
    expect(showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'red' })
    );
  });
});
