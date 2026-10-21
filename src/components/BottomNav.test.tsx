import { screen, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import BottomNav from './BottomNav';
import { useBibleStore } from '../store';
import { renderWithProviders } from '../__tests__/helpers';

const renderNav = () =>
  renderWithProviders(
    <BottomNav setBibleSelectorOpened={vi.fn()} />
  );

const getFooter = () => screen.getByRole('contentinfo');
const isVisible = () =>
  getFooter().getAttribute('data-bottom-nav-visible') === 'true';

describe('BottomNav', () => {
  it('is visible initially', () => {
    renderNav();
    expect(isVisible()).toBe(true);
  });

  it('slides off-screen when headerVisible flips to false ' +
    '(same flag MyHeader drives on scroll)', () => {
    renderNav();

    act(() => {
      useBibleStore.getState().setHeaderVisible(false);
    });
    expect(isVisible()).toBe(false);

    act(() => {
      useBibleStore.getState().setHeaderVisible(true);
    });
    expect(isVisible()).toBe(true);
  });
});
