import { render, screen, fireEvent } from
  '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Button from "./Button";

const mockOnClick = vi.fn();

describe('Button Component test', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('should render button Component', () => {
    render(<Button variant='subtle' size="xs" onClick={mockOnClick}>Click me</Button>)
    const clickMeBtn = screen.getByRole('button', { name: 'Click me' });
    fireEvent.click(clickMeBtn);

    expect(clickMeBtn).toBeInTheDocument();
    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });
});
