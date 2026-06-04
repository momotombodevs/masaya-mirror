import { writeFile } from 'node:fs/promises';
import type { AdbService } from '../device/adb.service';
import { err, ok, type Result } from '../../../shared/ipc/result';
import { CommandError, runCommandBuffer } from '../../utils/runCommand';

const ADB_NOT_FOUND_MESSAGE =
  'ADB no encontrado. Instala Android platform-tools o define ANDROID_HOME / ADB_PATH.';

/** QA actions backed by ADB — screenshot capture. */
export class QaService {
  constructor(private readonly adbService: AdbService) {}

  async takeScreenshot(deviceId: string, outputPath: string): Promise<Result<void>> {
    const adbPath = await this.adbService.getExecutablePath();
    if (!adbPath) {
      return err(ADB_NOT_FOUND_MESSAGE);
    }

    try {
      const stdout = await runCommandBuffer(adbPath, [
        '-s',
        deviceId,
        'exec-out',
        'screencap',
        '-p',
      ]);
      await writeFile(outputPath, stdout);
      return ok(undefined);
    } catch (error: unknown) {
      if (error instanceof CommandError) {
        return err(error.message);
      }
      if (error instanceof Error) {
        return err(error.message);
      }
      return err('Error desconocido al ejecutar adb.');
    }
  }
}
