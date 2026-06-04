import { ipcRenderer } from 'electron';
import {
  QA_CHANNELS,
  type CaptureImageRequest,
  type QaActionResponse,
  type SaveRecordingRequest,
} from '../shared/ipc/qa.contract';

export const qaApi = {
  copyCapture: (data: ArrayBuffer): Promise<QaActionResponse> =>
    ipcRenderer.invoke(QA_CHANNELS.copyCapture, { data } satisfies CaptureImageRequest),

  saveCapture: (data: ArrayBuffer): Promise<QaActionResponse> =>
    ipcRenderer.invoke(QA_CHANNELS.saveCapture, { data } satisfies CaptureImageRequest),

  saveRecording: (data: ArrayBuffer, mimeType: string): Promise<QaActionResponse> =>
    ipcRenderer.invoke(QA_CHANNELS.saveRecording, {
      data,
      mimeType,
    } satisfies SaveRecordingRequest),
};
