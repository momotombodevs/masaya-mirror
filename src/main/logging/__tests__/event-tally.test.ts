import { describe, expect, it, vi } from 'vitest';
import { EventTally } from '../event-tally';

describe('EventTally', () => {
  it('reports the 1st, 10th and 100th occurrence of each kind only', () => {
    const report = vi.fn();
    const tally = new EventTally(report);

    for (let i = 0; i < 150; i += 1) {
      tally.record('touch.pointerX');
    }
    tally.record('key.keyCode');

    expect(report.mock.calls).toEqual([
      ['touch.pointerX', 1],
      ['touch.pointerX', 10],
      ['touch.pointerX', 100],
      ['key.keyCode', 1],
    ]);
  });

  it('lists every kind with its total, most frequent first', () => {
    const tally = new EventTally(() => undefined);
    tally.record('a');
    tally.record('b');
    tally.record('b');

    expect(tally.entries()).toEqual([
      ['b', 2],
      ['a', 1],
    ]);
  });
});
