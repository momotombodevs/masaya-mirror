import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES } from '../../../../shared/preferences/types';
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

    expect(prefs.get()).toEqual(DEFAULT_PREFERENCES);
    expect(prefs.getAdbPath()).toBeNull();
    expect(prefs.getSaveDirectory()).toBeNull();
  });

  it('persists changes across instances, creating the folder', () => {
    const prefs = new PreferencesService(file);
    prefs.set({
      mirror: { maxSize: 2560, videoBitRate: 32_000_000, videoCodec: 'h265' },
      navigationBar: false,
      alwaysOnTop: true,
      showClicks: false,
      captureAction: 'copy',
    });
    prefs.setAdbPath('/opt/adb');
    prefs.setSaveDirectory('/Users/qa/Captures');

    const reloaded = new PreferencesService(file);
    expect(reloaded.get()).toEqual({
      mirror: { maxSize: 2560, videoBitRate: 32_000_000, videoCodec: 'h265' },
      navigationBar: false,
      alwaysOnTop: true,
      showClicks: false,
      captureAction: 'copy',
    });
    expect(reloaded.getAdbPath()).toBe('/opt/adb');
    expect(reloaded.getSaveDirectory()).toBe('/Users/qa/Captures');
  });

  it('applies a partial patch without touching the other preferences', () => {
    const prefs = new PreferencesService(file);
    prefs.set({ navigationBar: false });

    expect(prefs.get()).toEqual({ ...DEFAULT_PREFERENCES, navigationBar: false });
  });

  it('falls back to defaults for a corrupt file', () => {
    new PreferencesService(file).set({ alwaysOnTop: true });
    writeFileSync(file, '{not json');

    expect(new PreferencesService(file).get()).toEqual(DEFAULT_PREFERENCES);
  });

  it('keeps valid fields and drops invalid or unknown ones', () => {
    new PreferencesService(file).set({ alwaysOnTop: true });
    writeFileSync(
      file,
      JSON.stringify({
        navigationBar: false,
        alwaysOnTop: 'yes',
        captureAction: 'explode',
        mirror: { maxSize: 10, videoBitRate: 8_000_000, videoCodec: 'h264' },
        adbPath: 42,
        saveDirectory: '',
        extra: true,
      }),
    );

    const prefs = new PreferencesService(file);
    expect(prefs.get()).toEqual({ ...DEFAULT_PREFERENCES, navigationBar: false });
    expect(prefs.getAdbPath()).toBeNull();
    expect(prefs.getSaveDirectory()).toBeNull();

    prefs.set({ captureAction: 'save' });
    expect(Object.keys(JSON.parse(readFileSync(file, 'utf8')) as object).sort()).toEqual([
      'adbPath',
      'alwaysOnTop',
      'captureAction',
      'mirror',
      'navigationBar',
      'saveDirectory',
      'showClicks',
    ]);
  });

  it('migrates the quality preset saved by the first version', () => {
    new PreferencesService(file).set({ alwaysOnTop: false });
    writeFileSync(file, JSON.stringify({ quality: 'balanced', adbPath: '/opt/adb' }));

    const prefs = new PreferencesService(file);

    expect(prefs.get().mirror).toEqual({
      maxSize: 1280,
      videoBitRate: 8_000_000,
      videoCodec: 'h264',
    });
    expect(prefs.getAdbPath()).toBe('/opt/adb');
  });

  it('keeps working in memory when the file cannot be written', () => {
    const blocked = path.join(dir, 'blocker');
    writeFileSync(blocked, 'a file, not a folder');
    const prefs = new PreferencesService(path.join(blocked, 'settings.json'));

    prefs.set({ navigationBar: false });

    expect(prefs.get().navigationBar).toBe(false);
  });
});
