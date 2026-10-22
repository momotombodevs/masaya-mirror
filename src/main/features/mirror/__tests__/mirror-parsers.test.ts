import { describe, expect, it } from 'vitest';
import { DEFAULT_MIRROR_OPTIONS } from '../../../../shared/mirror/types';
import { parseControlMessage, parseMirrorOptions, parseVideoLayout } from '../ipc/mirror-parsers';

const touch = {
  type: 'touch',
  action: 0,
  pointerId: 1,
  pointerX: 100,
  pointerY: 200,
  videoWidth: 1080,
  videoHeight: 2400,
  pressure: 0.5,
};

describe('parseControlMessage', () => {
  it('accepts a touch and applies defaults for optional fields', () => {
    expect(parseControlMessage(touch)).toEqual({
      ok: true,
      value: { ...touch, buttons: 0, actionButton: 0 },
    });
  });

  it('rejects a touch with a missing required field', () => {
    const { pointerX: _omitted, ...incomplete } = touch;
    expect(parseControlMessage(incomplete)).toEqual({ ok: false, error: 'Invalid touch message.' });
  });

  it('rejects out-of-range and non-finite numbers', () => {
    expect(parseControlMessage({ ...touch, pressure: 2 }).ok).toBe(false);
    expect(parseControlMessage({ ...touch, pointerX: Number.NaN }).ok).toBe(false);
    expect(parseControlMessage({ ...touch, videoWidth: 0 }).ok).toBe(false);
    expect(parseControlMessage({ ...touch, action: '0' }).ok).toBe(false);
  });

  it('accepts a release past the top or left edge, so a drag off the screen still lifts the finger', () => {
    const release = { ...touch, action: 1, pointerX: -300, pointerY: -40, pressure: 0 };
    expect(parseControlMessage(release)).toMatchObject({
      ok: true,
      value: { pointerX: -300, pointerY: -40 },
    });
    expect(parseControlMessage({ ...touch, pointerX: -10_001 }).ok).toBe(false);
  });

  it('rounds integer fields but keeps fractional ones', () => {
    const result = parseControlMessage({ ...touch, pointerX: 10.6, pressure: 0.25 });
    expect(result).toMatchObject({ ok: true, value: { pointerX: 11, pressure: 0.25 } });
  });

  it('accepts scroll and key messages', () => {
    const scroll = {
      type: 'scroll',
      pointerX: 1,
      pointerY: 2,
      videoWidth: 100,
      videoHeight: 200,
      scrollY: -1.5,
    };
    expect(parseControlMessage(scroll)).toMatchObject({
      ok: true,
      value: { type: 'scroll', scrollX: 0, scrollY: -1.5, buttons: 0 },
    });
    expect(parseControlMessage({ type: 'key', action: 1, keyCode: 66 })).toEqual({
      ok: true,
      value: { type: 'key', action: 1, keyCode: 66, repeat: 0, metaState: 0 },
    });
  });

  it('accepts the Meta modifier state', () => {
    expect(
      parseControlMessage({ type: 'key', action: 0, keyCode: 29, metaState: 0x30000 }).ok,
    ).toBe(true);
  });

  it('validates text length in bytes', () => {
    expect(parseControlMessage({ type: 'text', text: 'ñ' })).toEqual({
      ok: true,
      value: { type: 'text', text: 'ñ' },
    });
    expect(parseControlMessage({ type: 'text', text: '' }).ok).toBe(false);
    expect(parseControlMessage({ type: 'text', text: 'é'.repeat(200) }).ok).toBe(false);
  });

  it('accepts a rotate request, which carries no data', () => {
    expect(parseControlMessage({ type: 'rotate' })).toEqual({
      ok: true,
      value: { type: 'rotate' },
    });
  });

  it('rejects unknown or malformed messages', () => {
    expect(parseControlMessage(null).ok).toBe(false);
    expect(parseControlMessage({ type: 'swipe' }).ok).toBe(false);
  });
});

describe('parseMirrorOptions', () => {
  it('falls back to defaults when absent', () => {
    expect(parseMirrorOptions(undefined)).toEqual({ ok: true, value: DEFAULT_MIRROR_OPTIONS });
  });

  it('merges partial options with defaults', () => {
    expect(parseMirrorOptions({ maxSize: 2560 })).toEqual({
      ok: true,
      value: { ...DEFAULT_MIRROR_OPTIONS, maxSize: 2560 },
    });
  });

  it('rejects values outside the supported range', () => {
    expect(parseMirrorOptions({ maxSize: 100 }).ok).toBe(false);
    expect(parseMirrorOptions({ videoBitRate: 1e9 }).ok).toBe(false);
    expect(parseMirrorOptions('fast').ok).toBe(false);
  });
});

describe('parseVideoLayout', () => {
  it('requires both dimensions', () => {
    expect(parseVideoLayout({ videoWidth: 1080, videoHeight: 2400 })).toEqual({
      ok: true,
      value: { videoWidth: 1080, videoHeight: 2400 },
    });
    expect(parseVideoLayout({ videoWidth: 1080 }).ok).toBe(false);
  });
});
