import { useCallback, useEffect, useRef, useState } from 'react';

export type ReconnectState =
  | { readonly status: 'idle' }
  | { readonly status: 'reconnecting'; readonly attempt: number }
  | { readonly status: 'failed' };

export type UseReconnectOptions = {
  /** Tries to open the mirror again; resolves true once the stream is back. */
  readonly reopen: () => Promise<boolean>;
  /** Wait before each attempt; the last value repeats. Its length is the attempt budget. */
  readonly delaysMs?: readonly number[];
  /** A reconnect that drops again sooner than this keeps spending the same budget. */
  readonly stableAfterMs?: number;
};

const RECONNECT_DELAYS_MS: readonly number[] = [
  1000, 2000, 3000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000,
];
const STABLE_AFTER_MS = 10_000;

export type UseReconnectResult = {
  readonly state: ReconnectState;
  readonly maxAttempts: number;
  /** Call when the stream ended without the user asking for it. */
  readonly begin: () => void;
  /** Stops retrying, e.g. because the user closed the window. */
  readonly cancel: () => void;
};

/**
 * Retries opening the mirror after an unexpected drop (cable pulled, Wi-Fi lost). The budget is
 * kept across drops that happen right after a reconnect, so a stream that dies on start cannot
 * loop forever.
 */
export function useReconnect({
  reopen,
  delaysMs = RECONNECT_DELAYS_MS,
  stableAfterMs = STABLE_AFTER_MS,
}: UseReconnectOptions): UseReconnectResult {
  const [state, setState] = useState<ReconnectState>({ status: 'idle' });
  const reopenRef = useRef(reopen);
  reopenRef.current = reopen;
  const runRef = useRef(0);
  const attemptsUsedRef = useRef(0);
  const lastSuccessRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const activeRef = useRef(false);
  const maxAttempts = delaysMs.length;

  const cancel = useCallback((): void => {
    runRef.current += 1;
    activeRef.current = false;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setState({ status: 'idle' });
  }, []);

  const begin = useCallback((): void => {
    // The stream error and the port close both report one drop; a retry cycle is already running.
    if (activeRef.current) {
      return;
    }
    activeRef.current = true;
    const run = ++runRef.current;
    const lastSuccess = lastSuccessRef.current;
    if (lastSuccess === null || Date.now() - lastSuccess >= stableAfterMs) {
      attemptsUsedRef.current = 0;
    }

    const attemptOnce = (): void => {
      if (run !== runRef.current) {
        return;
      }
      if (attemptsUsedRef.current >= maxAttempts) {
        activeRef.current = false;
        setState({ status: 'failed' });
        return;
      }
      const attempt = attemptsUsedRef.current + 1;
      attemptsUsedRef.current = attempt;
      setState({ status: 'reconnecting', attempt });
      const delay = delaysMs[Math.min(attempt - 1, delaysMs.length - 1)] ?? 0;
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        void reopenRef.current().then((opened) => {
          if (run !== runRef.current) {
            return;
          }
          if (opened) {
            lastSuccessRef.current = Date.now();
            activeRef.current = false;
            setState({ status: 'idle' });
          } else {
            attemptOnce();
          }
        });
      }, delay);
    };

    attemptOnce();
  }, [delaysMs, maxAttempts, stableAfterMs]);

  useEffect(() => cancel, [cancel]);

  return { state, maxAttempts, begin, cancel };
}
