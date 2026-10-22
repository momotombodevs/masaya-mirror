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
    /** Presentation time in microseconds, as the device stamped it. */
    readonly pts?: bigint;
  };
};

export type MirrorStreamCloseMessage = {
  readonly kind: 'close';
  readonly reason?: string;
};

export type MirrorStreamMessage =
  MirrorStreamInitMessage | MirrorStreamPacketMessage | MirrorStreamCloseMessage;

type MirrorTouchControl = {
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

type MirrorScrollControl = {
  readonly type: 'scroll';
  readonly pointerX: number;
  readonly pointerY: number;
  readonly videoWidth: number;
  readonly videoHeight: number;
  /** In wheel notches, as scrcpy counts them: 1 scrolls as far as one notch of a mouse wheel. */
  readonly scrollX: number;
  readonly scrollY: number;
  readonly buttons: number;
};

/** Largest scroll, in notches, a single message may carry. */
export const MAX_SCROLL_NOTCHES = 10;

type MirrorKeyControl = {
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

type MirrorTextControl = {
  readonly type: 'text';
  readonly text: string;
};

/** Turns the device screen 90°, like the rotate button of the system navigation. */
type MirrorRotateControl = {
  readonly type: 'rotate';
};

export type MirrorControlMessage =
  | MirrorTouchControl
  | MirrorScrollControl
  | MirrorKeyControl
  | MirrorTextControl
  | MirrorRotateControl;

/** scrcpy rejects text payloads longer than 300 bytes of UTF-8. */
export const MAX_MIRROR_TEXT_BYTES = 300;
