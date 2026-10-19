import { describe, expect, it } from 'vitest';
import { createControlCoalescer } from '../control-coalescer';

function fakeScheduler() {
  const callbacks = new Map<number, () => void>();
  let next = 1;
  return {
    scheduler: {
      schedule: (callback: () => void) => {
        const id = next++;
        callbacks.set(id, callback);
        return id;
      },
      cancel: (handle: unknown) => {
        callbacks.delete(handle as number);
      },
    },
    runFrame: () => {
      const pending = [...callbacks.values()];
      callbacks.clear();
      pending.forEach((callback) => callback());
    },
  };
}

describe('createControlCoalescer', () => {
  it('sends only the latest value once per frame', () => {
    const sent: number[] = [];
    const { scheduler, runFrame } = fakeScheduler();
    const coalescer = createControlCoalescer<number>((value) => sent.push(value), scheduler);

    coalescer.submit(1);
    coalescer.submit(2);
    coalescer.submit(3);
    expect(sent).toEqual([]);

    runFrame();
    expect(sent).toEqual([3]);
  });

  it('flush sends the pending value immediately and cancels the frame', () => {
    const sent: number[] = [];
    const { scheduler, runFrame } = fakeScheduler();
    const coalescer = createControlCoalescer<number>((value) => sent.push(value), scheduler);

    coalescer.submit(5);
    coalescer.flush();
    runFrame();

    expect(sent).toEqual([5]);
  });

  it('flush with nothing pending sends nothing', () => {
    const sent: number[] = [];
    const { scheduler } = fakeScheduler();
    const coalescer = createControlCoalescer<number>((value) => sent.push(value), scheduler);

    coalescer.flush();
    expect(sent).toEqual([]);
  });

  it('keeps the latest value for each key independently', () => {
    const sent: Array<{ id: number; x: number }> = [];
    const { scheduler, runFrame } = fakeScheduler();
    const coalescer = createControlCoalescer<{ id: number; x: number }>(
      (value) => sent.push(value),
      scheduler,
      (value) => value.id,
    );

    coalescer.submit({ id: 1, x: 1 });
    coalescer.submit({ id: 2, x: 1 });
    coalescer.submit({ id: 1, x: 2 });
    runFrame();

    expect(sent).toEqual([
      { id: 1, x: 2 },
      { id: 2, x: 1 },
    ]);
  });
});
