import { CommandError } from '../../utils/runCommand';

export const ADB_NOT_FOUND_MESSAGE =
  'ADB not found. Install Android platform-tools (Android Studio -> SDK Manager) or set ANDROID_HOME / ADB_PATH. Common paths: macOS ~/Library/Android/sdk/platform-tools/adb, Windows %LOCALAPPDATA%\\Android\\Sdk\\platform-tools\\adb.exe, Linux ~/Android/Sdk/platform-tools/adb.';

const ADB_TIMEOUT_MESSAGE =
  'ADB timed out. Make sure the adb server is running.';

const ADB_UNKNOWN_ERROR_MESSAGE = 'Unknown error while running adb.';

/** Maps a thrown command error into a user-facing English message. */
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
