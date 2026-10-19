import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { MIRROR_QUALITY_ORDER } from '../../../shared/mirror/quality';
import { DEFAULT_PREFERENCES, type Preferences } from '../../../shared/preferences/types';

/** Stored next to the preferences. Not shared with the renderer. */
type StoredSettings = Preferences & {
  readonly adbPath: string | null;
  readonly saveDirectory: string | null;
};

const DEFAULT_SETTINGS: StoredSettings = {
  ...DEFAULT_PREFERENCES,
  adbPath: null,
  saveDirectory: null,
};

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Keeps only valid, known fields, so a hand-edited or corrupt file cannot break the app. */
function sanitize(value: unknown): StoredSettings {
  const raw = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const quality = MIRROR_QUALITY_ORDER.find((preset) => preset === raw.quality);
  return {
    quality: quality ?? DEFAULT_SETTINGS.quality,
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
      return DEFAULT_SETTINGS;
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
    return { quality: this.settings.quality };
  }

  setQuality(quality: Preferences['quality']): void {
    this.update({ quality });
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
