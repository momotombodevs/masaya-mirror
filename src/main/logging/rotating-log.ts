import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import path from 'node:path';

export type RotatingLogOptions = {
  readonly directory: string;
  /** `main` writes `main.log`, then rotates it to `main.1.log`, `main.2.log`… */
  readonly baseName: string;
  /** The current file is rotated before a write would take it past this size. */
  readonly maxBytes: number;
  /** Rotated files kept besides the current one; older ones are overwritten. */
  readonly maxOldFiles: number;
};

/**
 * An append-only log file with a size cap. Writes are synchronous so the last lines before a
 * crash reach the disk, and they never throw: a full or read-only disk must not break the app.
 */
export class RotatingLog {
  /** Size of the current file, read from disk on the first write. */
  private size: number | null = null;

  constructor(private readonly options: RotatingLogOptions) {}

  get filePath(): string {
    return this.fileAt(0);
  }

  append(text: string): void {
    try {
      const bytes = Buffer.byteLength(text);
      const size = this.currentSize();
      if (size > 0 && size + bytes > this.options.maxBytes) {
        this.rotate();
      }
      appendFileSync(this.filePath, text);
      this.size = (this.size ?? 0) + bytes;
    } catch {
      // Nowhere left to report it; the app keeps working without a log.
      this.size = null;
    }
  }

  /** The last `count` lines across the current and rotated files, oldest first. */
  readTail(count: number): readonly string[] {
    const lines: string[] = [];
    for (let index = 0; index <= this.options.maxOldFiles && lines.length < count; index += 1) {
      const text = readText(this.fileAt(index));
      const fileLines = text.split('\n').filter((line) => line.length > 0);
      lines.unshift(...fileLines.slice(-(count - lines.length)));
    }
    return lines;
  }

  private fileAt(index: number): string {
    const name = index === 0 ? this.options.baseName : `${this.options.baseName}.${index}`;
    return path.join(this.options.directory, `${name}.log`);
  }

  private currentSize(): number {
    if (this.size === null) {
      mkdirSync(this.options.directory, { recursive: true });
      this.size = existsSync(this.filePath) ? statSync(this.filePath).size : 0;
    }
    return this.size;
  }

  /** `main.1.log` → `main.2.log`, `main.log` → `main.1.log`; the oldest is overwritten. */
  private rotate(): void {
    for (let index = this.options.maxOldFiles - 1; index >= 0; index -= 1) {
      if (existsSync(this.fileAt(index))) {
        renameSync(this.fileAt(index), this.fileAt(index + 1));
      }
    }
    // With no old files to keep, the current one is simply started over.
    rmSync(this.filePath, { force: true });
    this.size = 0;
  }
}

function readText(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}
