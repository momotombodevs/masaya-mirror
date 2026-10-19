/**
 * Maps DOM `KeyboardEvent.code` values to Android `KeyEvent` key codes.
 * Browser key codes do not match Android key codes, so an explicit table is
 * required. Unmapped keys return null and are ignored.
 */
function buildKeyCodeMap(): Record<string, number> {
  const map: Record<string, number> = {
    Space: 62,
    Enter: 66,
    Backspace: 67,
    Tab: 61,
    ArrowUp: 19,
    ArrowDown: 20,
    ArrowLeft: 21,
    ArrowRight: 22,
  };
  for (let i = 0; i < 26; i += 1) {
    map[`Key${String.fromCharCode(65 + i)}`] = 29 + i;
  }
  for (let i = 0; i <= 9; i += 1) {
    map[`Digit${i}`] = 7 + i;
  }
  return map;
}

const KEY_CODE_MAP = buildKeyCodeMap();

/** Android KEYCODE_BACK, also used for the right mouse button. */
export const ANDROID_KEYCODE_BACK = 4;

/** Hardware and navigation keys offered as toolbar buttons. */
export const ANDROID_KEYCODE = {
  home: 3,
  back: ANDROID_KEYCODE_BACK,
  volumeUp: 24,
  volumeDown: 25,
  power: 26,
  appSwitch: 187,
} as const;

export function mapBrowserKeyToAndroid(code: string): number | null {
  return KEY_CODE_MAP[code] ?? null;
}

/** Android meta-state bits (KeyEvent.META_*), including the left-side variants. */
const META_SHIFT = 0x01 | 0x40;
const META_ALT = 0x02 | 0x10;
const META_CTRL = 0x1000 | 0x2000;
const META_META = 0x10000 | 0x20000;

export type KeyModifiers = {
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
};

export function metaStateOf(modifiers: KeyModifiers): number {
  let state = 0;
  if (modifiers.shiftKey) state |= META_SHIFT;
  if (modifiers.altKey) state |= META_ALT;
  if (modifiers.ctrlKey) state |= META_CTRL;
  if (modifiers.metaKey) state |= META_META;
  return state;
}

export type KeyInput = KeyModifiers & {
  readonly key: string;
  readonly code: string;
  /** True while the AltGr layer is active (reported as Ctrl+Alt on Windows). */
  readonly altGraph?: boolean;
  /** True during IME composition or dead-key sequences, which produce no character yet. */
  readonly composing?: boolean;
};

export type ResolvedKey =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'keycode'; readonly keyCode: number; readonly metaState: number };

/**
 * Decides how a key press reaches the device. Printable characters without a
 * Ctrl/Meta shortcut modifier are injected as text so any character (accents, symbols)
 * arrives correctly. Everything else is sent as an Android key code with the
 * active modifiers.
 */
export function resolveKeyInput(input: KeyInput): ResolvedKey | null {
  if (input.composing || input.key === 'Dead' || input.key === 'Process') {
    return null;
  }

  const isShortcut = (input.ctrlKey && !input.altGraph) || input.metaKey;
  if (!isShortcut && [...input.key].length === 1) {
    return { kind: 'text', text: input.key };
  }

  const keyCode = mapBrowserKeyToAndroid(input.code);
  if (keyCode === null) {
    return null;
  }
  return { kind: 'keycode', keyCode, metaState: metaStateOf(input) };
}
