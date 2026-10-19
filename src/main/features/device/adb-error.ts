import { CommandError } from '../../utils/runCommand';

export const ADB_NOT_FOUND_MESSAGE =
  'ADB no encontrado. Instala las platform-tools de Android (Android Studio → SDK Manager) o define ANDROID_HOME / ADB_PATH. Rutas habituales: macOS ~/Library/Android/sdk/platform-tools/adb, Windows %LOCALAPPDATA%\\Android\\Sdk\\platform-tools\\adb.exe, Linux ~/Android/Sdk/platform-tools/adb.';

const ADB_TIMEOUT_MESSAGE =
  'ADB no respondió a tiempo. Comprueba que el servidor adb esté en marcha.';

const ADB_UNKNOWN_ERROR_MESSAGE = 'Error desconocido al ejecutar adb.';

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
