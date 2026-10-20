// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToolbarStatus } from '../useToolbarStatus';

describe('useToolbarStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('shows a message and clears it after a while', () => {
    const { result } = renderHook(() => useToolbarStatus());

    act(() => result.current.showStatus('Grabando'));
    expect(result.current.statusMessage).toBe('Grabando');

    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(result.current.statusMessage).toBeNull();
  });

  it('clears the message at once, and a later message gets its full time', () => {
    const { result } = renderHook(() => useToolbarStatus());
    act(() => result.current.showStatus('Instalando…'));

    act(() => result.current.clearStatus());
    expect(result.current.statusMessage).toBeNull();

    act(() => result.current.showStatus('Otro'));
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.statusMessage).toBe('Otro');
  });
});
