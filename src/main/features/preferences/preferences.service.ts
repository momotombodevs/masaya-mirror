import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readPreferences } from '../../../shared/preferences/parse';
import type { Preferences } from '../../../shared/preferences/types';

/** What is saved on disk: the preferences shared with windows, plus main-process-only settings. */
type StoredSettings = Preferences & {
  readonly adbPath: string | null;
  readonly saveDirectory: string | null;
};

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Keeps only valid, known fields, so a hand-edited or corrupt file cannot break the app. */
function sanitize(value: unknown): StoredSettings {
  const raw = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  return {
    ...readPreferences(raw),
    adbPath: nonEmptyString(raw.adbPath),
    saveDirectory: nonEmptyString(raw.saveDirectory),
  };
}

/** Small JSON settings file in the user data folder. Reads once, writes on every change. */
export class PreferencesService {
  private settings: StoredSettings;

  constructor(private readonly filePath: string) {
    this.settings = this.load();
  }

  private load(): StoredSettings {
    try {
      return sanitize(JSON.parse(readFileSync(this.filePath, 'utf8')));
    } catch {
      return sanitize(null);
    }
  }

  private update(patch: Partial<StoredSettings>): void {
    this.settings = sanitize({ ...this.settings, ...patch });
    try {
      mkdirSync(path.dirname(this.filePath), { recursive: true });
      writeFileSync(this.filePath, JSON.stringify(this.settings, null, 2));
    } catch {
      // Losing a preference is not worth interrupting the user; it stays in memory for this run.
    }
  }

  get(): Preferences {
    const {
      mirror,
      navigationBar,
      alwaysOnTop,
      showClicks,
      captureAction,
      audio,
      clipboardSync,
      language,
    } = this.settings;
    return {
      mirror,
      navigationBar,
      alwaysOnTop,
      showClicks,
      captureAction,
      audio,
      clipboardSync,
      language,
    };
  }

  /** Applies a patch already validated by `parsePreferencesPatch`. */
  set(patch: Partial<Preferences>): void {
    this.update(patch);
  }

  getAdbPath(): string | null {
    return this.settings.adbPath;
  }

  setAdbPath(adbPath: string | null): void {
    this.update({ adbPath });
  }

  getSaveDirectory(): string | null {
    return this.settings.saveDirectory;
  }

  setSaveDirectory(saveDirectory: string | null): void {
    this.update({ saveDirectory });
  }
}
