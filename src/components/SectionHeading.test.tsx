import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MantineProvider } from '@mantine/core';
import SectionHeading from './SectionHeading';

const renderWithMantine = (ui: React.ReactElement) =>
  render(<MantineProvider>{ui}</MantineProvider>);

describe('SectionHeading', () => {
  it('renders the heading text', () => {
    renderWithMantine(
      <SectionHeading text="The Sermon on the Mount" />
    );
    expect(
      screen.getByText('The Sermon on the Mount')
    ).toBeInTheDocument();
  });

  it('renders different heading text', () => {
    renderWithMantine(
      <SectionHeading text="The Beatitudes" />
    );
    expect(
      screen.getByText('The Beatitudes')
    ).toBeInTheDocument();
  });
});
