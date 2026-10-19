import { ADB_NOT_FOUND_MESSAGE } from '../../../shared/device/adb';
import { CommandError } from '../../utils/runCommand';

export { ADB_NOT_FOUND_MESSAGE };

const ADB_TIMEOUT_MESSAGE = 'ADB no responde. Revisa el servidor adb.';

const ADB_UNKNOWN_ERROR_MESSAGE = 'Error al ejecutar adb.';

/** Maps a thrown command error into a user-facing message. */
export function mapCommandError(error: unknown): string {
  if (error instanceof CommandError) {
    if (error.code === 'ENOENT') {
      return ADB_NOT_FOUND_MESSAGE;
    }
    if (error.timedOut) {
      return ADB_TIMEOUT_MESSAGE;
    }
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return ADB_UNKNOWN_ERROR_MESSAGE;
}
