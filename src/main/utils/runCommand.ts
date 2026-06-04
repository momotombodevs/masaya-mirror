import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type CommandResult = {
  readonly stdout: string;
  readonly stderr: string;
};

export class CommandError extends Error {
  readonly code: string | undefined;
  readonly stderr: string;
  readonly timedOut: boolean;

  constructor(message: string, options: { code?: string; stderr?: string; timedOut?: boolean }) {
    super(message);
    this.name = 'CommandError';
    this.code = options.code;
    this.stderr = options.stderr ?? '';
    this.timedOut = options.timedOut ?? false;
  }
}

function toCommandError(error: unknown): CommandError | unknown {
  if (error && typeof error === 'object') {
    const errObj = error as {
      code?: string;
      message?: string;
      stderr?: string;
      killed?: boolean;
      signal?: string;
    };
    const timedOut = errObj.killed === true && errObj.signal === 'SIGTERM';
    const stderr = typeof errObj.stderr === 'string' ? errObj.stderr.trim() : '';
    const message = stderr || errObj.message || 'Command failed';
    return new CommandError(message, { code: errObj.code, stderr, timedOut });
  }
  return error;
}

export async function runCommand(
  executable: string,
  args: readonly string[],
  timeoutMs = 15_000,
): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync(executable, [...args], {
      timeout: timeoutMs,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    return {
      stdout: typeof stdout === 'string' ? stdout : String(stdout),
      stderr: typeof stderr === 'string' ? stderr : String(stderr),
    };
  } catch (error: unknown) {
    throw toCommandError(error);
  }
}
