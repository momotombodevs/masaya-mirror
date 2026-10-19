import type {
  CloseMirrorResponse,
  MirrorControlResponse,
  MirrorStatusResponse,
  OpenMirrorResponse,
  OpenMirrorWindowResponse,
  MirrorStreamReadyResponse,
  SetMirrorOptionsResponse,
  SetMirrorVideoLayoutResponse,
} from '../../../shared/ipc/mirror.contract';
import type { MenuAction } from '../../../shared/ipc/menu.contract';
import type { QaActionResponse } from '../../../shared/ipc/qa.contract';
import type { ListDevicesResponse } from '../../../shared/ipc/device.contract';
import type { MirrorControlMessage, MirrorOptions } from '../../../shared/mirror/types';
export interface ManoloMirrorApi {
  onMenuAction(listener: (action: MenuAction) => void): () => void;
  listDevices(): Promise<ListDevicesResponse>;
  openMirrorWindow(deviceId: string, deviceLabel?: string): Promise<OpenMirrorWindowResponse>;
  openMirror(deviceId: string, options?: MirrorOptions): Promise<OpenMirrorResponse>;
  closeMirror(deviceId: string): Promise<CloseMirrorResponse>;
  getMirrorStatus(): Promise<MirrorStatusResponse>;
  sendControl(deviceId: string, message: MirrorControlMessage): Promise<MirrorControlResponse>;
  setMirrorOptions(deviceId: string, options: MirrorOptions): Promise<SetMirrorOptionsResponse>;
  notifyMirrorStreamReady(deviceId: string): Promise<MirrorStreamReadyResponse>;
  setMirrorVideoLayout(
    deviceId: string,
    videoWidth: number,
    videoHeight: number,
  ): Promise<SetMirrorVideoLayoutResponse>;
  copyCapture(data: ArrayBuffer): Promise<QaActionResponse>;
  saveCapture(data: ArrayBuffer): Promise<QaActionResponse>;
  saveRecording(data: ArrayBuffer, mimeType: string): Promise<QaActionResponse>;
}

declare global {
  interface Window {
    readonly manolo: ManoloMirrorApi;
  }
}

export {};
