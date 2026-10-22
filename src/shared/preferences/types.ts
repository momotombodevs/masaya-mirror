import type { LanguagePreference } from '../i18n/locale';
import { DEFAULT_MIRROR_OPTIONS, type MirrorOptions } from '../mirror/types';

/** What the record button produces. */
export type RecordingFormat = 'video' | 'gif';

export const RECORDING_FORMATS: readonly RecordingFormat[] = ['video', 'gif'];

/** What happens right after taking a screenshot. */
export type CaptureAction = 'preview' | 'copy' | 'save';

export const CAPTURE_ACTIONS: readonly CaptureAction[] = ['preview', 'copy', 'save'];

/** The video settings a mirror window starts with. */
export type MirrorVideoPreferences = Pick<MirrorOptions, 'maxSize' | 'videoBitRate' | 'videoCodec'>;

export type Preferences = {
  readonly mirror: MirrorVideoPreferences;
  /** Back, Home and Recents under the screen. */
  readonly navigationBar: boolean;
  readonly alwaysOnTop: boolean;
  /** Draws a dot in the mirror window where the mouse touches the screen. */
  readonly showClicks: boolean;
  readonly captureAction: CaptureAction;
  readonly recordingFormat: RecordingFormat;
  /** Plays the device audio in the mirror window (Android 11 or newer). */
  readonly audio: boolean;
  /** Keeps the computer and device clipboards equal. */
  readonly clipboardSync: boolean;
  readonly language: LanguagePreference;
};

export const DEFAULT_PREFERENCES: Preferences = {
  mirror: {
    maxSize: DEFAULT_MIRROR_OPTIONS.maxSize,
    videoBitRate: DEFAULT_MIRROR_OPTIONS.videoBitRate,
    videoCodec: DEFAULT_MIRROR_OPTIONS.videoCodec,
  },
  navigationBar: true,
  alwaysOnTop: false,
  showClicks: true,
  captureAction: 'preview',
  recordingFormat: 'video',
  audio: false,
  clipboardSync: true,
  language: 'system',
};
