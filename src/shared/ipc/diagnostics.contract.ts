import type { Result } from './result';

export const DIAGNOSTICS_CHANNELS = {
  copyReport: 'diagnostics:copy-report',
  openLogFolder: 'diagnostics:open-log-folder',
} as const;

/** The report goes straight to the clipboard from the main process; the window only learns it worked. */
export type CopyDiagnosticReportResponse = Result<void>;

export type OpenLogFolderResponse = Result<void>;
