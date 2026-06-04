import { ipcRenderer } from 'electron';
import {
  MIRROR_CHANNELS,
  type CloseMirrorResponse,
  type MirrorControlResponse,
  type MirrorStatusResponse,
  type OpenMirrorRequest,
  type OpenMirrorResponse,
  type OpenMirrorWindowRequest,
  type OpenMirrorWindowResponse,
  type CloseMirrorRequest,
  type MirrorControlRequest,
  type SetMirrorOptionsRequest,
  type SetMirrorOptionsResponse,
  type MirrorStreamReadyRequest,
  type MirrorStreamReadyResponse,
  type SetMirrorVideoLayoutRequest,
  type SetMirrorVideoLayoutResponse,
} from '../shared/ipc/mirror.contract';
import type { MirrorControlMessage, MirrorOptions } from '../shared/mirror/types';

export const mirrorApi = {
  openMirrorWindow: (
    deviceId: string,
    deviceLabel?: string,
  ): Promise<OpenMirrorWindowResponse> =>
    ipcRenderer.invoke(MIRROR_CHANNELS.openWindow, {
      deviceId,
      deviceLabel,
    } satisfies OpenMirrorWindowRequest),

  openMirror: (
    deviceId: string,
    options?: MirrorOptions,
  ): Promise<OpenMirrorResponse> =>
    ipcRenderer.invoke(MIRROR_CHANNELS.open, {
      deviceId,
      options,
    } satisfies OpenMirrorRequest),

  closeMirror: (deviceId: string): Promise<CloseMirrorResponse> =>
    ipcRenderer.invoke(MIRROR_CHANNELS.close, { deviceId } satisfies CloseMirrorRequest),

  getMirrorStatus: (): Promise<MirrorStatusResponse> =>
    ipcRenderer.invoke(MIRROR_CHANNELS.status),

  sendControl: (
    deviceId: string,
    message: MirrorControlMessage,
  ): Promise<MirrorControlResponse> =>
    ipcRenderer.invoke(MIRROR_CHANNELS.control, {
      deviceId,
      message,
    } satisfies MirrorControlRequest),

  setMirrorOptions: (
    deviceId: string,
    options: MirrorOptions,
  ): Promise<SetMirrorOptionsResponse> =>
    ipcRenderer.invoke(MIRROR_CHANNELS.setOptions, {
      deviceId,
      options,
    } satisfies SetMirrorOptionsRequest),

  notifyMirrorStreamReady: (deviceId: string): Promise<MirrorStreamReadyResponse> =>
    ipcRenderer.invoke(MIRROR_CHANNELS.streamReady, {
      deviceId,
    } satisfies MirrorStreamReadyRequest),

  setMirrorVideoLayout: (
    deviceId: string,
    videoWidth: number,
    videoHeight: number,
  ): Promise<SetMirrorVideoLayoutResponse> =>
    ipcRenderer.invoke(MIRROR_CHANNELS.setVideoLayout, {
      deviceId,
      videoWidth,
      videoHeight,
    } satisfies SetMirrorVideoLayoutRequest),
};
