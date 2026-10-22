import { homedir } from 'node:os';
import { EventTally } from './event-tally';
import { RotatingLog } from './rotating-log';

export type LogLevel = 'info' | 'warn' | 'error';

/** About 6 MB on disk at most: the current file and two rotated ones. */
const MAX_LOG_BYTES = 2 * 1024 * 1024;
const MAX_OLD_LOG_FILES = 2;

let file: RotatingLog | null = null;
let directory: string | null = null;

/** Starts writing to `main.log` in `logDirectory`. Until then lines only go to the console. */
export function initLogFile(logDirectory: string): void {
  directory = logDirectory;
  file = new RotatingLog({
    directory: logDirectory,
    baseName: 'main',
    maxBytes: MAX_LOG_BYTES,
    maxOldFiles: MAX_OLD_LOG_FILES,
  });
}

export function getLogDirectory(): string | null {
  return directory;
}

export function readRecentLogLines(count: number): readonly string[] {
  return file?.readTail(count) ?? [];
}

/** The stack when there is one; it names the failing step better than the message alone. */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`;
  }
  return String(error);
}

/** The user's home folder carries their account name; `~` says the same for debugging. */
export function redactHome(text: string, home = homedir()): string {
  return home.length > 1 ? text.split(home).join('~') : text;
}

/** One entry per line; continuation lines (stacks) are indented under it. */
export function formatLogLine(date: Date, level: LogLevel, scope: string, message: string): string {
  const body = redactHome(message).replace(/\r?\n/g, '\n    ');
  return `${date.toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${body}\n`;
}

function write(level: LogLevel, scope: string, message: string, error?: unknown): void {
  const text = error === undefined ? message : `${message}: ${describeError(error)}`;
  file?.append(formatLogLine(new Date(), level, scope, text));
  // Errors always reached the terminal before there was a log file; info only in development.
  if (level !== 'info' || process.env.VITE_DEV_SERVER_URL) {
    const print = level === 'info' ? console.log : level === 'warn' ? console.warn : console.error;
    print(`[${scope}] ${text}`);
  }
}

const tally = new EventTally((key, count) => write('warn', 'tally', `${key} (×${count})`));

/**
 * Main-process diagnostics, read back by "Copiar diagnóstico". Never pass clipboard contents,
 * typed text or anything else the user wrote; device serials and file paths are fine.
 */
export const log = {
  info: (scope: string, message: string): void => write('info', scope, message),
  warn: (scope: string, message: string, error?: unknown): void =>
    write('warn', scope, message, error),
  error: (scope: string, message: string, error?: unknown): void =>
    write('error', scope, message, error),
  /** For events that can repeat many times a second: logged at the 1st, 10th, 100th… time. */
  count: (scope: string, kind: string): void => tally.record(`${scope}: ${kind}`),
};

export function getEventCounts(): readonly (readonly [kind: string, count: number])[] {
  return tally.entries();
}
