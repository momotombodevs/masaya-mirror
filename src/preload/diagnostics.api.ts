import { ipcRenderer } from 'electron';
import {
  DIAGNOSTICS_CHANNELS,
  type CopyDiagnosticReportResponse,
  type OpenLogFolderResponse,
} from '../shared/ipc/diagnostics.contract';

export const diagnosticsApi = {
  copyDiagnosticReport: (): Promise<CopyDiagnosticReportResponse> =>
    ipcRenderer.invoke(DIAGNOSTICS_CHANNELS.copyReport),

  openLogFolder: (): Promise<OpenLogFolderResponse> =>
    ipcRenderer.invoke(DIAGNOSTICS_CHANNELS.openLogFolder),
};
