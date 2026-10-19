import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PreferencesService } from '../preferences.service';

describe('PreferencesService', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'manolo-prefs-'));
    file = path.join(dir, 'nested', 'settings.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('starts with defaults when there is no file', () => {
    const prefs = new PreferencesService(file);

    expect(prefs.get()).toEqual({ quality: 'high' });
    expect(prefs.getAdbPath()).toBeNull();
    expect(prefs.getSaveDirectory()).toBeNull();
  });

  it('persists changes across instances, creating the folder', () => {
    const prefs = new PreferencesService(file);
    prefs.setQuality('max');
    prefs.setAdbPath('/opt/adb');
    prefs.setSaveDirectory('/Users/qa/Captures');

    const reloaded = new PreferencesService(file);
    expect(reloaded.get()).toEqual({ quality: 'max' });
    expect(reloaded.getAdbPath()).toBe('/opt/adb');
    expect(reloaded.getSaveDirectory()).toBe('/Users/qa/Captures');
  });

  it('falls back to defaults for a corrupt file', () => {
    new PreferencesService(file).setQuality('balanced');
    writeFileSync(file, '{not json');

    expect(new PreferencesService(file).get()).toEqual({ quality: 'high' });
  });

  it('drops unknown fields and invalid values', () => {
    new PreferencesService(file).setQuality('balanced');
    writeFileSync(
      file,
      JSON.stringify({ quality: 'ultra', adbPath: 42, saveDirectory: '', extra: true }),
    );

    const prefs = new PreferencesService(file);
    expect(prefs.get()).toEqual({ quality: 'high' });
    expect(prefs.getAdbPath()).toBeNull();
    expect(prefs.getSaveDirectory()).toBeNull();

    prefs.setQuality('max');
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
      quality: 'max',
      adbPath: null,
      saveDirectory: null,
    });
  });

  it('keeps working in memory when the file cannot be written', () => {
    const blocked = path.join(dir, 'blocker');
    writeFileSync(blocked, 'a file, not a folder');
    const prefs = new PreferencesService(path.join(blocked, 'settings.json'));

    prefs.setQuality('max');

    expect(prefs.get()).toEqual({ quality: 'max' });
  });
});
