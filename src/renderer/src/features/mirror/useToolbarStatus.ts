import { useCallback, useEffect, useRef, useState } from 'react';

const STATUS_TIMEOUT_MS = 2500;

export type ToolbarStatus = {
  readonly statusMessage: string | null;
  readonly showStatus: (message: string) => void;
  readonly clearStatus: () => void;
};

/** Transient status message shown in the mirror toolbar, auto-cleared after a delay. */
export function useToolbarStatus(): ToolbarStatus {
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const showStatus = useCallback((message: string): void => {
    setStatusMessage(message);
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = window.setTimeout(() => setStatusMessage(null), STATUS_TIMEOUT_MS);
  }, []);

  const clearStatus = useCallback((): void => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setStatusMessage(null);
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return { statusMessage, showStatus, clearStatus };
}
