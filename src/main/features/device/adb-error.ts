import { ADB_NOT_FOUND_MESSAGE } from '../../../shared/device/adb';
import { mt } from '../../i18n';
import { CommandError } from '../../utils/runCommand';

export { ADB_NOT_FOUND_MESSAGE };

/** Maps a thrown command error into a user-facing message. */
export function mapCommandError(error: unknown): string {
  if (error instanceof CommandError) {
    if (error.code === 'ENOENT') {
      return ADB_NOT_FOUND_MESSAGE;
    }
    if (error.timedOut) {
      return mt('main.adbTimeout');
    }
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return mt('main.adbUnknown');
}
