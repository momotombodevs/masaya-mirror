import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    vi.restoreAllMocks();
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
      recordingFormat: 'gif',
      audio: true,
      clipboardSync: false,
      language: 'en',
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
      recordingFormat: 'gif',
      audio: true,
      clipboardSync: false,
      language: 'en',
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
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
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
      'audio',
      'captureAction',
      'clipboardSync',
      'language',
      'mirror',
      'navigationBar',
      'recordingFormat',
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
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const blocked = path.join(dir, 'blocker');
    writeFileSync(blocked, 'a file, not a folder');
    const prefs = new PreferencesService(path.join(blocked, 'settings.json'));

    prefs.set({ navigationBar: false });

    expect(prefs.get().navigationBar).toBe(false);
  });

  describe('failures', () => {
    it('does not log when there is simply no file yet', () => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      new PreferencesService(file);

      expect(logged).not.toHaveBeenCalled();
    });

    it('logs an unreadable settings file instead of hiding it', () => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      new PreferencesService(file).set({ alwaysOnTop: true });
      writeFileSync(file, '{not json');

      new PreferencesService(file);

      expect(logged).toHaveBeenCalledTimes(1);
    });

    it('logs a failed write and keeps the value in memory', () => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const blocked = path.join(dir, 'blocker');
      writeFileSync(blocked, 'a file, not a folder');
      const prefs = new PreferencesService(path.join(blocked, 'settings.json'));
      logged.mockClear();

      prefs.set({ navigationBar: false });

      expect(logged).toHaveBeenCalledTimes(1);
      expect(prefs.get().navigationBar).toBe(false);
    });

    it('writes through a temp file and leaves nothing behind', () => {
      new PreferencesService(file).set({ navigationBar: false });

      expect(readdirSync(path.dirname(file))).toEqual(['settings.json']);
      expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ navigationBar: false });
    });

    it('cleans up its temp file when the final rename fails', () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      // A folder where the file belongs makes the rename fail after the temp file was written.
      mkdirSync(file, { recursive: true });

      new PreferencesService(file).set({ navigationBar: false });

      expect(readdirSync(path.dirname(file))).toEqual(['settings.json']);
    });
  });
});
