import { describe, expect, it } from 'vitest';
import { parsePreferencesPatch, readPreferences } from '../parse';
import { DEFAULT_PREFERENCES } from '../types';

const MIRROR = { maxSize: 1920, videoBitRate: 16_000_000, videoCodec: 'h264' } as const;

describe('parsePreferencesPatch', () => {
  it('accepts any subset of valid preferences', () => {
    expect(parsePreferencesPatch({ navigationBar: false })).toEqual({
      ok: true,
      value: { navigationBar: false },
    });
    expect(
      parsePreferencesPatch({ mirror: MIRROR, captureAction: 'save', alwaysOnTop: true }),
    ).toEqual({
      ok: true,
      value: { mirror: MIRROR, captureAction: 'save', alwaysOnTop: true },
    });
  });

  it('ignores unknown keys', () => {
    expect(parsePreferencesPatch({ navigationBar: true, adbPath: '/evil' })).toEqual({
      ok: true,
      value: { navigationBar: true },
    });
  });

  it('rejects the whole patch when a known field is invalid', () => {
    expect(parsePreferencesPatch({ navigationBar: 'no' }).ok).toBe(false);
    expect(parsePreferencesPatch({ captureAction: 'delete' }).ok).toBe(false);
    expect(parsePreferencesPatch({ navigationBar: true, alwaysOnTop: 1 }).ok).toBe(false);
  });

  it('rejects out-of-range or incomplete video settings', () => {
    expect(parsePreferencesPatch({ mirror: { ...MIRROR, maxSize: 100 } }).ok).toBe(false);
    expect(parsePreferencesPatch({ mirror: { ...MIRROR, maxSize: 1920.5 } }).ok).toBe(false);
    expect(parsePreferencesPatch({ mirror: { ...MIRROR, videoBitRate: 500_000_000 } }).ok).toBe(
      false,
    );
    expect(parsePreferencesPatch({ mirror: { ...MIRROR, videoCodec: 'vp9' } }).ok).toBe(false);
    expect(parsePreferencesPatch({ mirror: { maxSize: 1920 } }).ok).toBe(false);
  });

  it('rejects payloads that are not objects', () => {
    expect(parsePreferencesPatch(null).ok).toBe(false);
    expect(parsePreferencesPatch('navigationBar').ok).toBe(false);
  });
});

describe('readPreferences', () => {
  it('returns defaults for anything that is not an object', () => {
    expect(readPreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(readPreferences(7)).toEqual(DEFAULT_PREFERENCES);
  });

  it('prefers the new video settings over the legacy preset', () => {
    const prefs = readPreferences({ quality: 'max', mirror: { ...MIRROR, maxSize: 1280 } });

    expect(prefs.mirror.maxSize).toBe(1280);
  });
});
