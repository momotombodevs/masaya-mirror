// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutoRefresh } from '../useAutoRefresh';

describe('useAutoRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('refreshes on every interval and when the window regains focus', () => {
    const refresh = vi.fn();
    renderHook(() => useAutoRefresh(refresh, 1000));

    vi.advanceTimersByTime(2000);
    expect(refresh).toHaveBeenCalledTimes(2);

    window.dispatchEvent(new Event('focus'));
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it('uses the latest callback without restarting the timer', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ fn }) => useAutoRefresh(fn, 1000), {
      initialProps: { fn: first },
    });

    rerender({ fn: second });
    vi.advanceTimersByTime(1000);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('stops after unmount', () => {
    const refresh = vi.fn();
    const { unmount } = renderHook(() => useAutoRefresh(refresh, 1000));
    unmount();

    vi.advanceTimersByTime(5000);
    window.dispatchEvent(new Event('focus'));

    expect(refresh).not.toHaveBeenCalled();
  });
});
