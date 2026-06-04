import type { Result } from './result';

export const QA_CHANNELS = {
  copyCapture: 'qa:copy-capture',
  saveCapture: 'qa:save-capture',
  saveRecording: 'qa:save-recording',
} as const;

export type CaptureImageRequest = {
  readonly data: ArrayBuffer;
};

export type SaveRecordingRequest = {
  readonly data: ArrayBuffer;
  readonly mimeType: string;
};

export type QaActionSuccess = {
  readonly saved?: boolean;
  readonly copied?: boolean;
};

export type QaActionResponse = Result<QaActionSuccess>;
