import { describe, expect, it } from 'vitest';
import { sameFields, sameItems } from '../same-items';

describe('same-items', () => {
  it('compares lists by item identity and order', () => {
    expect(sameItems(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(sameItems(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(sameItems(['a'], ['a', 'b'])).toBe(false);
  });

  it('compares records by their fields', () => {
    expect(sameFields({ id: 'a', model: 'P' }, { id: 'a', model: 'P' })).toBe(true);
    expect(sameFields({ id: 'a', model: 'P' }, { id: 'a', model: 'Q' })).toBe(false);
    expect(sameFields({ id: 'a' }, { id: 'a', model: 'P' } as { id: string })).toBe(false);
  });
});
