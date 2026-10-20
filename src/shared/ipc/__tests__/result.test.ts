import { describe, expect, it } from 'vitest';
import { err, mapResult, ok } from '../result';

describe('err', () => {
  it('omits the code unless one is given', () => {
    expect(err('boom')).toStrictEqual({ ok: false, error: 'boom' });
    expect(err('boom', 'ADB_NOT_FOUND')).toStrictEqual({
      ok: false,
      error: 'boom',
      code: 'ADB_NOT_FOUND',
    });
  });
});

describe('mapResult', () => {
  it('transforms the value of a success', () => {
    expect(mapResult(ok(2), (n) => ({ doubled: n * 2 }))).toEqual(ok({ doubled: 4 }));
  });

  it('passes a failure through untouched, code included', () => {
    const failure = err('boom', 'ADB_NOT_FOUND');
    expect(mapResult(failure, () => 'never')).toBe(failure);
  });
});
