import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { useEffect } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { showNotification } from '@mantine/notifications';
import { ErrorBoundary } from './ErrorBoundary';

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

  it('recovers a caught error when resetKey changes', () => {
    vi.spyOn(console, 'error').mockImplementation(
      () => undefined
    );
    let shouldThrow = true;
    const MaybeThrow = (): JSX.Element => {
      if (shouldThrow) throw new Error('boom');
      return <div>recovered</div>;
    };

    const { rerender } = render(
      <MantineProvider>
        <ErrorBoundary resetKey="/notes">
          <MaybeThrow />
        </ErrorBoundary>
      </MantineProvider>
    );
    expect(
      screen.getByText('Something went wrong')
    ).toBeInTheDocument();

    // Intra-section navigation (/notes -> /notes/:id) keeps
    // the boundary mounted — resetKey drives the recovery.
    shouldThrow = false;
    rerender(
      <MantineProvider>
        <ErrorBoundary resetKey="/notes/1">
          <MaybeThrow />
        </ErrorBoundary>
      </MantineProvider>
    );
    expect(screen.getByText('recovered')).toBeInTheDocument();
  });

  it('does not remount healthy children when resetKey ' +
    'changes', () => {
    let mounts = 0;
    const Child = (): JSX.Element => {
      useEffect(() => {
        mounts += 1;
      }, []);
      return <div>child</div>;
    };

    const { rerender } = render(
      <MantineProvider>
        <ErrorBoundary resetKey="/bible/JHN.1">
          <Child />
        </ErrorBoundary>
      </MantineProvider>
    );
    rerender(
      <MantineProvider>
        <ErrorBoundary resetKey="/bible/JHN.1.3">
          <Child />
        </ErrorBoundary>
      </MantineProvider>
    );
    expect(mounts).toBe(1);
  });
});
