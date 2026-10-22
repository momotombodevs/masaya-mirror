import { clipboard, shell } from 'electron';
import {
  DIAGNOSTICS_CHANNELS,
  type CopyDiagnosticReportResponse,
  type OpenLogFolderResponse,
} from '../../../../shared/ipc/diagnostics.contract';
import { err, ok } from '../../../../shared/ipc/result';
import { fromMirrorWindow, handleIpc } from '../../../ipc/handle-ipc';
import { getLogDirectory, log } from '../../../logging/log';
import type { AdbService } from '../../device/adb.service';
import type { MirrorWindowService } from '../../mirror/mirror-window.service';
import { collectDiagnosticReport } from '../diagnostics.service';

/** Both actions live in the settings screen, which only mirror windows show. */
export function registerDiagnosticsIpcHandlers(
  adbService: AdbService,
  mirrorWindowService: MirrorWindowService,
): void {
  const guard = fromMirrorWindow(mirrorWindowService);

  handleIpc(
    DIAGNOSTICS_CHANNELS.copyReport,
    guard,
    async (): Promise<CopyDiagnosticReportResponse> => {
      try {
        clipboard.writeText(await collectDiagnosticReport(adbService));
        return ok(undefined);
      } catch (error: unknown) {
        log.error('diagnostics', 'could not build the report', error);
        return err(error instanceof Error ? error.message : 'Unable to build the report.');
      }
    },
  );

  handleIpc(DIAGNOSTICS_CHANNELS.openLogFolder, guard, async (): Promise<OpenLogFolderResponse> => {
    const directory = getLogDirectory();
    if (!directory) {
      return err('There is no log folder.');
    }
    // Resolves to an error message, or to an empty string once the folder is open.
    const failure = await shell.openPath(directory);
    return failure ? err(failure) : ok(undefined);
  });
}
