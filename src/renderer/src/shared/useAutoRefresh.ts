import { useEffect, useRef } from 'react';

/**
 * Calls `refresh` every `intervalMs` and whenever the window regains focus, but only while the
 * window is visible. The latest `refresh` is always used, so callers need not memoize it.
 */
export function useAutoRefresh(refresh: () => void, intervalMs: number): void {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    const refreshIfVisible = (): void => {
      if (document.visibilityState === 'visible') {
        refreshRef.current();
      }
    };
    const timer = window.setInterval(refreshIfVisible, intervalMs);
    window.addEventListener('focus', refreshIfVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshIfVisible);
    };
  }, [intervalMs]);
}
