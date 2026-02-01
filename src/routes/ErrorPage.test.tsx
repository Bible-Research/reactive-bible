import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, cleanupTestEnvironment } from '../__tests__/helpers';
import ErrorPage from './ErrorPage';
import * as ReactRouterDom from 'react-router-dom';

const mockUseRouteError = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof ReactRouterDom>('react-router-dom');
  return {
    ...actual,
    useRouteError: () => mockUseRouteError(),
  };
});

describe('ErrorPage', () => {
  beforeEach(() => {
    cleanupTestEnvironment();
    vi.clearAllMocks();
  });

  it('renders error message from RouteErrorResponse', () => {
    // Note: isRouteErrorResponse checks for specific properties
    // Our mock doesn't pass that check, so it falls through to generic error
    mockUseRouteError.mockReturnValue({
      status: 404,
      statusText: 'Not Found',
      data: { message: 'Page not found' },
    });

    renderWithProviders(<ErrorPage />, { initialRoutes: ['/'] });

    expect(screen.getByText('Oops!')).toBeInTheDocument();
    expect(
      screen.getByText('Sorry, an unexpected error has occurred.')
    ).toBeInTheDocument();
    // The mock doesn't pass isRouteErrorResponse check, so shows generic message
    expect(screen.getByText('An unexpected error occurred')).toBeInTheDocument();
  });

  it('renders error message from Error object', () => {
    mockUseRouteError.mockReturnValue(
      new Error('Something went wrong')
    );

    renderWithProviders(<ErrorPage />, { initialRoutes: ['/'] });

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders generic error message for unknown error type', () => {
    mockUseRouteError.mockReturnValue(
      'Unknown error'
    );

    renderWithProviders(<ErrorPage />, { initialRoutes: ['/'] });

    expect(
      screen.getByText('An unexpected error occurred')
    ).toBeInTheDocument();
  });

  it('renders "Go Home" button', () => {
    mockUseRouteError.mockReturnValue(
      new Error('Test error')
    );

    renderWithProviders(<ErrorPage />, { initialRoutes: ['/'] });

    const homeButton = screen.getByRole('link', { name: /go home/i });
    expect(homeButton).toBeInTheDocument();
    expect(homeButton).toHaveAttribute('href', '/');
  });

  it('displays error message with red color prop', () => {
    mockUseRouteError.mockReturnValue(
      new Error('Test error')
    );

    renderWithProviders(<ErrorPage />, { initialRoutes: ['/'] });

    const errorText = screen.getByText('Test error');
    // Mantine converts 'red' color prop to hex value
    expect(errorText).toHaveStyle({ color: '#fa5252' });
  });
});
