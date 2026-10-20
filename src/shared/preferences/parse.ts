import { LANGUAGE_PREFERENCES } from '../i18n/locale';
import { err, ok, type Result } from '../ipc/result';
import { MIRROR_QUALITY_ORDER, MIRROR_QUALITY_PRESETS } from '../mirror/quality';
import {
  CAPTURE_ACTIONS,
  DEFAULT_PREFERENCES,
  type MirrorVideoPreferences,
  type Preferences,
} from './types';

const MIN_MAX_SIZE = 256;
const MAX_MAX_SIZE = 8192;
const MIN_BIT_RATE = 1_000_000;
const MAX_BIT_RATE = 100_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function integerInRange(value: unknown, min: number, max: number): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? value
    : undefined;
}

function parseMirror(value: unknown): MirrorVideoPreferences | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const maxSize = integerInRange(value.maxSize, MIN_MAX_SIZE, MAX_MAX_SIZE);
  const videoBitRate = integerInRange(value.videoBitRate, MIN_BIT_RATE, MAX_BIT_RATE);
  const videoCodec =
    value.videoCodec === 'h264' || value.videoCodec === 'h265' ? value.videoCodec : undefined;
  return maxSize !== undefined && videoBitRate !== undefined && videoCodec !== undefined
    ? { maxSize, videoBitRate, videoCodec }
    : undefined;
}

const parseBoolean = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined;

const parseCaptureAction = (value: unknown): Preferences['captureAction'] | undefined =>
  CAPTURE_ACTIONS.find((action) => action === value);

const parseLanguage = (value: unknown): Preferences['language'] | undefined =>
  LANGUAGE_PREFERENCES.find((language) => language === value);

/** One parser per preference. Each returns undefined for an invalid value. */
const FIELD_PARSERS: {
  readonly [K in keyof Preferences]: (value: unknown) => Preferences[K] | undefined;
} = {
  mirror: parseMirror,
  navigationBar: parseBoolean,
  alwaysOnTop: parseBoolean,
  showClicks: parseBoolean,
  captureAction: parseCaptureAction,
  audio: parseBoolean,
  clipboardSync: parseBoolean,
  language: parseLanguage,
};

const FIELDS = Object.keys(FIELD_PARSERS) as readonly (keyof Preferences)[];

/** Strict: for a request from a window. Any known field with a bad value rejects the whole patch. */
export function parsePreferencesPatch(payload: unknown): Result<Partial<Preferences>> {
  if (!isRecord(payload)) {
    return err('Preferencia inválida.');
  }
  const patch: Record<string, unknown> = {};
  for (const field of FIELDS) {
    if (!(field in payload)) {
      continue;
    }
    const parsed = FIELD_PARSERS[field](payload[field]);
    if (parsed === undefined) {
      return err('Preferencia inválida.');
    }
    patch[field] = parsed;
  }
  return ok(patch as Partial<Preferences>);
}

/** Settings written by the first version stored only a quality preset. */
function legacyMirror(raw: Record<string, unknown>): MirrorVideoPreferences | undefined {
  const preset = MIRROR_QUALITY_ORDER.find((candidate) => candidate === raw.quality);
  return preset
    ? { ...DEFAULT_PREFERENCES.mirror, ...MIRROR_QUALITY_PRESETS[preset].values }
    : undefined;
}

/** Lenient: for a file on disk. Keeps every valid field and falls back to the default for the rest. */
export function readPreferences(raw: unknown): Preferences {
  if (!isRecord(raw)) {
    return DEFAULT_PREFERENCES;
  }
  const field = <K extends keyof Preferences>(name: K): Preferences[K] =>
    FIELD_PARSERS[name](raw[name]) ?? DEFAULT_PREFERENCES[name];
  return {
    mirror: parseMirror(raw.mirror) ?? legacyMirror(raw) ?? DEFAULT_PREFERENCES.mirror,
    navigationBar: field('navigationBar'),
    alwaysOnTop: field('alwaysOnTop'),
    showClicks: field('showClicks'),
    captureAction: field('captureAction'),
    audio: field('audio'),
    clipboardSync: field('clipboardSync'),
    language: field('language'),
  };
}
