import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
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

  it('calls onClick when clicked', () => {
    const handleClick = vi.fn();
    renderWithMantine(
      <SectionHeading text="Salt and Light" onClick={handleClick} />
    );
    fireEvent.click(screen.getByText('Salt and Light'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('sets the id attribute when provided', () => {
    renderWithMantine(
      <SectionHeading
        text="The Lord's Prayer"
        id="section-heading-9"
      />
    );
    expect(
      document.getElementById('section-heading-9')
    ).toBeInTheDocument();
  });

  it('does not call onClick when not provided', () => {
    renderWithMantine(<SectionHeading text="No Click" />);
    expect(() =>
      fireEvent.click(screen.getByText('No Click'))
    ).not.toThrow();
  });
});
