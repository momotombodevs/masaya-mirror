// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReconnect } from '../useReconnect';

const DELAYS = [100, 200, 300];

function render(reopen: () => Promise<boolean>, stableAfterMs = 10_000) {
  return renderHook(() => useReconnect({ reopen, delaysMs: DELAYS, stableAfterMs }));
}

describe('useReconnect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('starts idle and does nothing until a drop is reported', async () => {
    const reopen = vi.fn(() => Promise.resolve(true));
    const { result } = render(reopen);

    await act(() => vi.advanceTimersByTimeAsync(10_000));

    expect(result.current.state).toEqual({ status: 'idle' });
    expect(reopen).not.toHaveBeenCalled();
  });

  it('retries with growing waits until the mirror opens', async () => {
    const reopen = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const { result } = render(reopen);

    act(() => result.current.begin());
    expect(result.current.state).toEqual({ status: 'reconnecting', attempt: 1 });

    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(reopen).toHaveBeenCalledTimes(1);
    expect(result.current.state).toEqual({ status: 'reconnecting', attempt: 2 });

    await act(() => vi.advanceTimersByTimeAsync(199));
    expect(reopen).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(reopen).toHaveBeenCalledTimes(2);

    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(reopen).toHaveBeenCalledTimes(3);
    expect(result.current.state).toEqual({ status: 'idle' });
  });

  it('gives up when the attempts run out', async () => {
    const reopen = vi.fn(() => Promise.resolve(false));
    const { result } = render(reopen);

    act(() => result.current.begin());
    await act(() => vi.advanceTimersByTimeAsync(10_000));

    expect(reopen).toHaveBeenCalledTimes(DELAYS.length);
    expect(result.current.state).toEqual({ status: 'failed' });
  });

  it('can start over after giving up', async () => {
    const reopen = vi.fn(() => Promise.resolve(false));
    const { result } = render(reopen);
    act(() => result.current.begin());
    await act(() => vi.advanceTimersByTimeAsync(10_000));

    reopen.mockResolvedValue(true);
    act(() => result.current.begin());
    await act(() => vi.advanceTimersByTimeAsync(100));

    expect(result.current.state).toEqual({ status: 'idle' });
  });

  it('stops retrying once cancelled', async () => {
    const reopen = vi.fn(() => Promise.resolve(false));
    const { result } = render(reopen);

    act(() => result.current.begin());
    act(() => result.current.cancel());
    await act(() => vi.advanceTimersByTimeAsync(10_000));

    expect(reopen).not.toHaveBeenCalled();
    expect(result.current.state).toEqual({ status: 'idle' });
  });

  it('keeps spending the same budget when a reconnect drops right away', async () => {
    const reopen = vi.fn(() => Promise.resolve(true));
    const { result } = render(reopen);

    for (let drop = 0; drop < DELAYS.length; drop += 1) {
      act(() => result.current.begin());
      await act(() => vi.advanceTimersByTimeAsync(1_000));
    }
    expect(reopen).toHaveBeenCalledTimes(DELAYS.length);

    act(() => result.current.begin());
    expect(result.current.state).toEqual({ status: 'failed' });
  });

  it('refills the budget after a stable connection', async () => {
    const reopen = vi.fn(() => Promise.resolve(true));
    const { result } = render(reopen, 5_000);

    act(() => result.current.begin());
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    await act(() => vi.advanceTimersByTimeAsync(6_000));
    act(() => result.current.begin());

    expect(result.current.state).toEqual({ status: 'reconnecting', attempt: 1 });
  });
});
