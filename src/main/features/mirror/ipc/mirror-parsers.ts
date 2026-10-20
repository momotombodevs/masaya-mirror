import { err, ok, type Result } from '../../../../shared/ipc/result';
import {
  DEFAULT_MIRROR_OPTIONS,
  MAX_MIRROR_TEXT_BYTES,
  type MirrorControlMessage,
  type MirrorOptions,
} from '../../../../shared/mirror/types';
import { parseNumericFields, type NumericRules } from './numeric-fields';

const MAX_VIDEO_DIMENSION = 10_000;
const MAX_ANDROID_BUTTON_MASK = 0xffff;
const MAX_ANDROID_KEYCODE = 400;
const MAX_KEY_REPEAT = 100;
const MAX_META_STATE = 0xffffff;
const MAX_SCROLL_DELTA = 10;

const POINTER_RULES = {
  pointerX: { max: MAX_VIDEO_DIMENSION },
  pointerY: { max: MAX_VIDEO_DIMENSION },
  videoWidth: { min: 1, max: MAX_VIDEO_DIMENSION },
  videoHeight: { min: 1, max: MAX_VIDEO_DIMENSION },
  buttons: { max: MAX_ANDROID_BUTTON_MASK, fallback: 0 },
} satisfies NumericRules;

const TOUCH_RULES = {
  ...POINTER_RULES,
  action: { max: 2 },
  pointerId: { max: Number.MAX_SAFE_INTEGER },
  pressure: { max: 1, fractional: true },
  actionButton: { max: MAX_ANDROID_BUTTON_MASK, fallback: 0 },
} satisfies NumericRules;

const SCROLL_RULES = {
  ...POINTER_RULES,
  scrollX: { min: -MAX_SCROLL_DELTA, max: MAX_SCROLL_DELTA, fallback: 0, fractional: true },
  scrollY: { min: -MAX_SCROLL_DELTA, max: MAX_SCROLL_DELTA, fallback: 0, fractional: true },
} satisfies NumericRules;

const KEY_RULES = {
  action: { max: 1 },
  keyCode: { max: MAX_ANDROID_KEYCODE },
  repeat: { max: MAX_KEY_REPEAT, fallback: 0 },
  metaState: { max: MAX_META_STATE, fallback: 0 },
} satisfies NumericRules;

const OPTION_RULES = {
  maxSize: { min: 256, max: 8192, fallback: DEFAULT_MIRROR_OPTIONS.maxSize },
  videoBitRate: {
    min: 1_000_000,
    max: 100_000_000,
    fallback: DEFAULT_MIRROR_OPTIONS.videoBitRate,
  },
} satisfies NumericRules;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseMirrorOptions(value: unknown): Result<MirrorOptions> {
  if (value === undefined || value === null) {
    return ok(DEFAULT_MIRROR_OPTIONS);
  }
  if (!isRecord(value)) {
    return err('Invalid mirror options.');
  }

  const numbers = parseNumericFields(value, OPTION_RULES, 'Invalid mirror options.');
  if (!numbers.ok) {
    return numbers;
  }

  return ok({
    ...numbers.value,
    videoCodec:
      value.videoCodec === 'h265' || value.videoCodec === 'h264'
        ? value.videoCodec
        : DEFAULT_MIRROR_OPTIONS.videoCodec,
    audioEnabled:
      typeof value.audioEnabled === 'boolean'
        ? value.audioEnabled
        : DEFAULT_MIRROR_OPTIONS.audioEnabled,
    clipboardSync:
      typeof value.clipboardSync === 'boolean'
        ? value.clipboardSync
        : DEFAULT_MIRROR_OPTIONS.clipboardSync,
  });
}

export function parseVideoLayout(
  value: unknown,
): Result<{ readonly videoWidth: number; readonly videoHeight: number }> {
  return parseNumericFields(
    isRecord(value) ? value : {},
    { videoWidth: POINTER_RULES.videoWidth, videoHeight: POINTER_RULES.videoHeight },
    'Invalid video dimensions.',
  );
}

export function parseControlMessage(value: unknown): Result<MirrorControlMessage> {
  if (!isRecord(value)) {
    return err('Invalid control message.');
  }

  switch (value.type) {
    case 'touch': {
      const fields = parseNumericFields(value, TOUCH_RULES, 'Invalid touch message.');
      return fields.ok ? ok({ type: 'touch', ...fields.value }) : fields;
    }
    case 'scroll': {
      const fields = parseNumericFields(value, SCROLL_RULES, 'Invalid scroll message.');
      return fields.ok ? ok({ type: 'scroll', ...fields.value }) : fields;
    }
    case 'key': {
      const fields = parseNumericFields(value, KEY_RULES, 'Invalid key message.');
      return fields.ok ? ok({ type: 'key', ...fields.value }) : fields;
    }
    case 'rotate':
      return ok({ type: 'rotate' });
    case 'text': {
      if (typeof value.text !== 'string' || value.text.length === 0) {
        return err('Invalid text message.');
      }
      if (new TextEncoder().encode(value.text).byteLength > MAX_MIRROR_TEXT_BYTES) {
        return err('Text message is too long.');
      }
      return ok({ type: 'text', text: value.text });
    }
    default:
      return err('Invalid control message.');
  }
}
