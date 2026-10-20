import type { ScrcpyVideoCodecId } from '@yume-chan/scrcpy';

export type MirrorOptions = {
  readonly maxSize: number;
  readonly videoBitRate: number;
  readonly videoCodec: 'h264' | 'h265';
  readonly audioEnabled: boolean;
  /** Keeps the computer and device clipboards equal. */
  readonly clipboardSync: boolean;
};

/** maxSize 1920 = longest edge capped at Full HD. */
export const DEFAULT_MIRROR_OPTIONS: MirrorOptions = {
  maxSize: 1920,
  videoBitRate: 16_000_000,
  videoCodec: 'h264',
  audioEnabled: false,
  clipboardSync: true,
};

export type MirrorVideoMetadata = {
  readonly codec: ScrcpyVideoCodecId;
  readonly width: number;
  readonly height: number;
};

export type MirrorStreamInitMessage = {
  readonly kind: 'init';
  readonly deviceId: string;
  readonly video: MirrorVideoMetadata;
  readonly audioCodec: string | null;
  readonly audioWebCodecId: string | null;
};

export type MirrorStreamPacketMessage = {
  readonly kind: 'packet';
  readonly stream: 'video' | 'audio';
  readonly packet: {
    readonly type: 'configuration' | 'data';
    readonly data: Uint8Array;
    readonly keyframe?: boolean;
  };
};

export type MirrorStreamCloseMessage = {
  readonly kind: 'close';
  readonly reason?: string;
};

export type MirrorStreamMessage =
  MirrorStreamInitMessage | MirrorStreamPacketMessage | MirrorStreamCloseMessage;

export type MirrorTouchControl = {
  readonly type: 'touch';
  readonly action: number;
  readonly pointerId: number;
  readonly pointerX: number;
  readonly pointerY: number;
  readonly videoWidth: number;
  readonly videoHeight: number;
  readonly pressure: number;
  readonly buttons: number;
  readonly actionButton: number;
};

export type MirrorScrollControl = {
  readonly type: 'scroll';
  readonly pointerX: number;
  readonly pointerY: number;
  readonly videoWidth: number;
  readonly videoHeight: number;
  readonly scrollX: number;
  readonly scrollY: number;
  readonly buttons: number;
};

export type MirrorKeyControl = {
  readonly type: 'key';
  readonly action: number;
  readonly keyCode: number;
  readonly repeat: number;
  readonly metaState: number;
};

/** Matches Android MotionEvent actions used by scrcpy. */
export const ANDROID_MOTION_EVENT_ACTION = {
  down: 0,
  up: 1,
  move: 2,
} as const;

export const ANDROID_KEY_EVENT_ACTION = {
  down: 0,
  up: 1,
} as const;

export type MirrorTextControl = {
  readonly type: 'text';
  readonly text: string;
};

export type MirrorControlMessage =
  MirrorTouchControl | MirrorScrollControl | MirrorKeyControl | MirrorTextControl;

/** scrcpy rejects text payloads longer than 300 bytes of UTF-8. */
export const MAX_MIRROR_TEXT_BYTES = 300;
