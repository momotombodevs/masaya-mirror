import type { MirrorControlMessage, MirrorOptions, MirrorVideoMetadata } from '../mirror/types';
import type { Result } from './result';

export const MIRROR_CHANNELS = {
  open: 'mirror:open',
  openWindow: 'mirror:open-window',
  close: 'mirror:close',
  status: 'mirror:status',
  control: 'mirror:control',
  setOptions: 'mirror:set-options',
  port: 'mirror:port',
  streamReady: 'mirror:stream-ready',
  setVideoLayout: 'mirror:set-video-layout',
} as const;

export type SetMirrorVideoLayoutRequest = {
  readonly deviceId: string;
  readonly videoWidth: number;
  readonly videoHeight: number;
};

export type SetMirrorVideoLayoutResponse = Result<void>;

export type MirrorStreamReadyRequest = { readonly deviceId: string };

export type MirrorStreamReadyResponse = Result<void>;

export type OpenMirrorWindowRequest = {
  readonly deviceId: string;
  readonly deviceLabel?: string;
};

export type OpenMirrorWindowResponse = Result<void>;

export type OpenMirrorRequest = {
  readonly deviceId: string;
  readonly options?: MirrorOptions;
};

export type CloseMirrorRequest = { readonly deviceId: string };

export type MirrorControlRequest = {
  readonly deviceId: string;
  readonly message: MirrorControlMessage;
};

export type SetMirrorOptionsRequest = {
  readonly deviceId: string;
  readonly options: MirrorOptions;
};

export type OpenMirrorSuccess = {
  readonly metadata: MirrorVideoMetadata;
  readonly audioEnabled: boolean;
};

export type OpenMirrorResponse = Result<OpenMirrorSuccess>;
export type CloseMirrorResponse = Result<void>;
export type MirrorStatusResponse = Result<{ readonly activeDeviceIds: readonly string[] }>;
export type MirrorControlResponse = Result<void>;
export type SetMirrorOptionsResponse = Result<OpenMirrorSuccess>;
