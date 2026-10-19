/**
 * Keeps only the latest pending value per key and sends them once per scheduled frame.
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
  keyOf: (value: T) => unknown = () => null,
): ControlCoalescer<T> {
  const pending = new Map<unknown, T>();
  let handle: unknown = null;

  const flush = (): void => {
    if (handle !== null) {
      scheduler.cancel(handle);
      handle = null;
    }
    const values = [...pending.values()];
    pending.clear();
    values.forEach(send);
  };

  return {
    submit(value) {
      pending.set(keyOf(value), value);
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
