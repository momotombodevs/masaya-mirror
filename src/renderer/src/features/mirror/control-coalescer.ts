/**
 * Keeps only the latest pending value and sends it once per scheduled frame.
 * Use `flush` before sending a non-move event so the device sees the final
 * position of a drag before the press or release that follows it.
 */
export type ControlCoalescer<T> = {
  submit(value: T): void;
  flush(): void;
};

type Scheduler = {
  schedule: (callback: () => void) => unknown;
  cancel: (handle: unknown) => void;
};

export function createControlCoalescer<T>(
  send: (value: T) => void,
  scheduler: Scheduler,
): ControlCoalescer<T> {
  let pending: { value: T } | null = null;
  let handle: unknown = null;

  const flush = (): void => {
    if (handle !== null) {
      scheduler.cancel(handle);
      handle = null;
    }
    if (pending) {
      const { value } = pending;
      pending = null;
      send(value);
    }
  };

  return {
    submit(value) {
      pending = { value };
      if (handle === null) {
        handle = scheduler.schedule(() => {
          handle = null;
          flush();
        });
      }
    },
    flush,
  };
}
