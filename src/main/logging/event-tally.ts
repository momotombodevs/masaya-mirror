/**
 * Counts repeated events by kind and reports only the 1st, 10th, 100th… occurrence, so a
 * flood (a bad message on every pointer move) stays a handful of log lines with a running count.
 */
export class EventTally {
  private readonly counts = new Map<string, number>();

  constructor(private readonly report: (kind: string, count: number) => void) {}

  record(kind: string): void {
    const count = (this.counts.get(kind) ?? 0) + 1;
    this.counts.set(kind, count);
    if (isPowerOfTen(count)) {
      this.report(kind, count);
    }
  }

  /** Every kind seen so far with its total, most frequent first. */
  entries(): readonly (readonly [kind: string, count: number])[] {
    return [...this.counts].sort((a, b) => b[1] - a[1]);
  }
}

function isPowerOfTen(count: number): boolean {
  let value = count;
  while (value >= 10 && value % 10 === 0) {
    value /= 10;
  }
  return value === 1;
}
