import { deviceApi } from './device.api';
import { mirrorApi } from './mirror.api';
import { menuApi } from './menu.api';
import { qaApi } from './qa.api';

export const manoloApi = {
  ...deviceApi,
  ...mirrorApi,
  ...qaApi,
  ...menuApi,
};

const API_NOT_AVAILABLE_MESSAGE = 'API no disponible en esta ventana.';

function unavailableResult<T>(): Promise<T> {
  return Promise.resolve({ ok: false, error: API_NOT_AVAILABLE_MESSAGE } as T);
}

export function createMainWindowApi() {
  return {
    onMenuAction: menuApi.onMenuAction,
    listDevices: deviceApi.listDevices,
    openMirrorWindow: mirrorApi.openMirrorWindow,
    getMirrorStatus: mirrorApi.getMirrorStatus,
    openMirror: () => unavailableResult<ReturnType<typeof mirrorApi.openMirror> extends Promise<infer T> ? T : never>(),
    closeMirror: () => unavailableResult<ReturnType<typeof mirrorApi.closeMirror> extends Promise<infer T> ? T : never>(),
    sendControl: () => unavailableResult<ReturnType<typeof mirrorApi.sendControl> extends Promise<infer T> ? T : never>(),
    setMirrorOptions: () => unavailableResult<ReturnType<typeof mirrorApi.setMirrorOptions> extends Promise<infer T> ? T : never>(),
    notifyMirrorStreamReady: () => unavailableResult<ReturnType<typeof mirrorApi.notifyMirrorStreamReady> extends Promise<infer T> ? T : never>(),
    setMirrorVideoLayout: () => unavailableResult<ReturnType<typeof mirrorApi.setMirrorVideoLayout> extends Promise<infer T> ? T : never>(),
    copyCapture: () => unavailableResult<ReturnType<typeof qaApi.copyCapture> extends Promise<infer T> ? T : never>(),
    saveCapture: () => unavailableResult<ReturnType<typeof qaApi.saveCapture> extends Promise<infer T> ? T : never>(),
    saveRecording: () => unavailableResult<ReturnType<typeof qaApi.saveRecording> extends Promise<infer T> ? T : never>(),
  };
}

export function createMirrorWindowApi() {
  return {
    onMenuAction: menuApi.onMenuAction,
    listDevices: () => unavailableResult<ReturnType<typeof deviceApi.listDevices> extends Promise<infer T> ? T : never>(),
    openMirrorWindow: () => unavailableResult<ReturnType<typeof mirrorApi.openMirrorWindow> extends Promise<infer T> ? T : never>(),
    getMirrorStatus: mirrorApi.getMirrorStatus,
    openMirror: mirrorApi.openMirror,
    closeMirror: mirrorApi.closeMirror,
    sendControl: mirrorApi.sendControl,
    setMirrorOptions: mirrorApi.setMirrorOptions,
    notifyMirrorStreamReady: mirrorApi.notifyMirrorStreamReady,
    setMirrorVideoLayout: mirrorApi.setMirrorVideoLayout,
    copyCapture: qaApi.copyCapture,
    saveCapture: qaApi.saveCapture,
    saveRecording: qaApi.saveRecording,
  };
}
