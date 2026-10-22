import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RotatingLog, type RotatingLogOptions } from '../rotating-log';

describe('RotatingLog', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'masaya-log-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const create = (options: Partial<RotatingLogOptions> = {}): RotatingLog =>
    new RotatingLog({
      directory: path.join(dir, 'logs'),
      baseName: 'main',
      maxBytes: 20,
      maxOldFiles: 2,
      ...options,
    });

  const read = (name: string): string => readFileSync(path.join(dir, 'logs', name), 'utf8');

  it('creates the folder and appends to main.log', () => {
    const log = create({ maxBytes: 1_000 });

    log.append('one\n');
    log.append('two\n');

    expect(log.filePath).toBe(path.join(dir, 'logs', 'main.log'));
    expect(read('main.log')).toBe('one\ntwo\n');
  });

  it('rotates before a write would pass the size cap', () => {
    const log = create();

    log.append('aaaaaaaaa\n'); // 10 bytes
    log.append('bbbbbbbbb\n'); // 20 bytes: still fits
    log.append('ccccccccc\n'); // would be 30: rotates first

    expect(read('main.1.log')).toBe('aaaaaaaaa\nbbbbbbbbb\n');
    expect(read('main.log')).toBe('ccccccccc\n');
  });

  it('keeps only maxOldFiles rotated files, dropping the oldest', () => {
    const log = create({ maxBytes: 5 });

    for (const line of ['111\n', '222\n', '333\n', '444\n']) {
      log.append(line);
    }

    expect(readdirSync(path.join(dir, 'logs')).sort()).toEqual([
      'main.1.log',
      'main.2.log',
      'main.log',
    ]);
    expect(read('main.2.log')).toBe('222\n');
    expect(read('main.1.log')).toBe('333\n');
    expect(read('main.log')).toBe('444\n');
  });

  it('starts the file over when no old files are kept', () => {
    const log = create({ maxBytes: 5, maxOldFiles: 0 });

    log.append('111\n');
    log.append('222\n');

    expect(readdirSync(path.join(dir, 'logs'))).toEqual(['main.log']);
    expect(read('main.log')).toBe('222\n');
  });

  it('counts a file left by a previous run toward the cap', () => {
    const logs = path.join(dir, 'logs');
    create({ maxBytes: 1_000 }).append('x'.repeat(15) + '\n');

    create().append('next\n');

    expect(read('main.1.log')).toBe('x'.repeat(15) + '\n');
    expect(read('main.log')).toBe('next\n');
    expect(existsSync(path.join(logs, 'main.2.log'))).toBe(false);
  });

  it('reads the last lines across the current and rotated files, oldest first', () => {
    const log = create({ maxBytes: 8 });
    for (const line of ['1', '2', '3', '4', '5', '6']) {
      log.append(`${line}\n`);
    }

    expect(log.readTail(3)).toEqual(['4', '5', '6']);
    expect(log.readTail(100)).toEqual(['1', '2', '3', '4', '5', '6']);
  });

  it('reads nothing when there is no log yet', () => {
    expect(create().readTail(10)).toEqual([]);
  });

  it('never throws when the folder cannot be written', () => {
    const blocker = path.join(dir, 'logs');
    writeFileSync(blocker, 'a file where the folder should be');
    const log = create();

    expect(() => log.append('lost\n')).not.toThrow();
    expect(log.readTail(10)).toEqual([]);
  });
});
