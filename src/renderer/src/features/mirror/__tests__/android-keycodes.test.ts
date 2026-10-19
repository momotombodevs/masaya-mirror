import { describe, expect, it } from 'vitest';
import { metaStateOf, resolveKeyInput } from '../android-keycodes';

const none = { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false };

describe('resolveKeyInput', () => {
  it('injects printable characters as text', () => {
    expect(resolveKeyInput({ ...none, key: 'a', code: 'KeyA' })).toEqual({
      kind: 'text',
      text: 'a',
    });
    expect(resolveKeyInput({ ...none, key: 'ñ', code: 'Semicolon' })).toEqual({
      kind: 'text',
      text: 'ñ',
    });
    expect(resolveKeyInput({ ...none, key: ' ', code: 'Space' })).toEqual({
      kind: 'text',
      text: ' ',
    });
  });

  it('sends non-printable keys as Android key codes', () => {
    expect(resolveKeyInput({ ...none, key: 'Enter', code: 'Enter' })).toEqual({
      kind: 'keycode',
      keyCode: 66,
      metaState: 0,
    });
    expect(resolveKeyInput({ ...none, key: 'Backspace', code: 'Backspace' })).toEqual({
      kind: 'keycode',
      keyCode: 67,
      metaState: 0,
    });
  });

  it('sends shortcuts as key codes with modifier state', () => {
    expect(
      resolveKeyInput({ ...none, ctrlKey: true, key: 'c', code: 'KeyC' }),
    ).toEqual({ kind: 'keycode', keyCode: 31, metaState: 0x3000 });
  });

  it('injects AltGr characters as text', () => {
    expect(
      resolveKeyInput({ ...none, ctrlKey: true, altKey: true, altGraph: true, key: '@', code: 'Digit2' }),
    ).toEqual({ kind: 'text', text: '@' });
  });

  it('injects Option-layer characters as text', () => {
    expect(resolveKeyInput({ ...none, altKey: true, key: '€', code: 'Digit2' })).toEqual({
      kind: 'text',
      text: '€',
    });
  });

  it('ignores dead keys and composition', () => {
    expect(resolveKeyInput({ ...none, key: 'Dead', code: 'Quote' })).toBeNull();
    expect(resolveKeyInput({ ...none, composing: true, key: 'a', code: 'KeyA' })).toBeNull();
  });

  it('keeps the meta state sent for the Meta key within the validated range', () => {
    const resolved = resolveKeyInput({ ...none, metaKey: true, key: 'a', code: 'KeyA' });
    expect(resolved).toEqual({ kind: 'keycode', keyCode: 29, metaState: 0x30000 });
  });

  it('returns null for keys it cannot map', () => {
    expect(resolveKeyInput({ ...none, key: 'F13', code: 'F13' })).toBeNull();
  });
});

describe('metaStateOf', () => {
  it('combines modifier bits', () => {
    expect(metaStateOf({ ...none, shiftKey: true })).toBe(0x41);
    expect(metaStateOf({ ...none, shiftKey: true, ctrlKey: true })).toBe(0x41 | 0x3000);
    expect(metaStateOf(none)).toBe(0);
  });
});
