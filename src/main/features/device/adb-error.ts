import { ADB_NOT_FOUND_MESSAGE } from '../../../shared/device/adb';
import { err, type Result } from '../../../shared/ipc/result';
import { mt } from '../../i18n';
import { CommandError } from '../../utils/runCommand';

/** The failure for a missing `adb`, which the renderer recognises by its code. */
export function adbNotFound(): Result<never> {
  return err(ADB_NOT_FOUND_MESSAGE, 'ADB_NOT_FOUND');
}

/** Thrown where a Result cannot be returned; `commandFailure` turns it back into `adbNotFound`. */
export class AdbNotFoundError extends Error {
  constructor() {
    super(ADB_NOT_FOUND_MESSAGE);
    this.name = 'AdbNotFoundError';
  }
}

/** Maps a thrown command error into a user-facing failure. */
export function commandFailure(error: unknown): Result<never> {
  if (error instanceof AdbNotFoundError) {
    return adbNotFound();
  }
  if (error instanceof CommandError) {
    if (error.code === 'ENOENT') {
      return adbNotFound();
    }
    return err(error.timedOut ? mt('main.adbTimeout') : error.message);
  }
  if (error instanceof Error) {
    return err(error.message);
  }
  return err(mt('main.adbUnknown'));
}
