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

export function mapBrowserKeyToAndroid(code: string): number | null {
  return KEY_CODE_MAP[code] ?? null;
}
