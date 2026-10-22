import { describe, expect, it } from 'vitest';
import { describeError, formatLogLine, redactHome } from '../log';

describe('formatLogLine', () => {
  it('writes time, padded level and scope on one line', () => {
    const line = formatLogLine(new Date('2026-10-22T17:00:00.000Z'), 'info', 'mirror', 'started');

    expect(line).toBe('2026-10-22T17:00:00.000Z INFO  [mirror] started\n');
  });

  it('indents continuation lines such as a stack', () => {
    const line = formatLogLine(new Date(0), 'error', 'app', 'boom\n  at x');

    expect(line).toBe('1970-01-01T00:00:00.000Z ERROR [app] boom\n      at x\n');
  });
});

describe('redactHome', () => {
  it('replaces the home folder, which names the account, with ~', () => {
    expect(redactHome('/Users/ana/sdk/adb and /Users/ana/x', '/Users/ana')).toBe(
      '~/sdk/adb and ~/x',
    );
  });

  it('leaves text alone when there is no usable home folder', () => {
    expect(redactHome('/usr/bin/adb', '/')).toBe('/usr/bin/adb');
  });
});

describe('describeError', () => {
  it('prefers the stack of an Error and stringifies anything else', () => {
    const error = new Error('nope');

    expect(describeError(error)).toContain('Error: nope');
    expect(describeError('plain')).toBe('plain');
  });
});
