import type { Result } from './result';

export const QA_CHANNELS = {
  screenshot: 'qa:screenshot',
  copyCapture: 'qa:copy-capture',
  saveCapture: 'qa:save-capture',
  saveRecording: 'qa:save-recording',
} as const;

export type CaptureImageRequest = {
  readonly data: ArrayBuffer;
};

export type QaDeviceRequest = { readonly deviceId: string };

export type SaveRecordingRequest = {
  readonly data: ArrayBuffer;
  readonly mimeType: string;
};

export type QaActionSuccess = {
  readonly saved?: boolean;
  readonly copied?: boolean;
};

export type QaActionResponse = Result<QaActionSuccess>;
