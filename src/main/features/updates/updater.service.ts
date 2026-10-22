import { log } from '../../logging/log';

/** The part of electron-updater's `autoUpdater` that the service uses; tests provide a fake. */
export interface UpdateDriver {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  on(
    event: 'update-available' | 'update-not-available' | 'update-downloaded',
    listener: (info: { version: string }) => void,
  ): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
}

/** What a manual check tells the user; background checks only ever prompt for a restart. */
export type UpdateNotice =
  { kind: 'upToDate' } | { kind: 'available'; version: string } | { kind: 'failed' };

export interface UpdaterDeps {
  driver: UpdateDriver;
  confirmRestart: (version: string) => Promise<boolean>;
  notify: (notice: UpdateNotice) => void;
  /** Delay before the first background check, so startup is not slowed down. */
  startDelayMs?: number;
  intervalMs?: number;
}

const DEFAULT_START_DELAY_MS = 10_000;
const DEFAULT_INTERVAL_MS = 4 * 60 * 60 * 1000;

/**
 * Downloads updates in the background and offers to restart once one is ready. Declining
 * installs it on the next quit instead, and the prompt does not repeat for that version
 * unless the user checks manually.
 */
export class UpdaterService {
  private downloadedVersion: string | null = null;
  private promptedVersion: string | null = null;
  private manualCheckPending = false;

  constructor(private readonly deps: UpdaterDeps) {
    const { driver } = deps;
    driver.autoDownload = true;
    driver.autoInstallOnAppQuit = true;
    driver.on('update-available', ({ version }) => {
      if (this.takeManualCheck()) {
        deps.notify({ kind: 'available', version });
      }
    });
    driver.on('update-not-available', () => {
      if (this.takeManualCheck()) {
        deps.notify({ kind: 'upToDate' });
      }
    });
    driver.on('update-downloaded', ({ version }) => {
      this.downloadedVersion = version;
      void this.promptRestart();
    });
    driver.on('error', (error) => this.handleFailure(error));
  }

  /** Schedules the first background check and the periodic ones. */
  start(): void {
    const { startDelayMs = DEFAULT_START_DELAY_MS, intervalMs = DEFAULT_INTERVAL_MS } = this.deps;
    const check = (): void => void this.runCheck();
    // The timers live as long as the app and must not keep the process alive on their own.
    setTimeout(check, startDelayMs).unref();
    setInterval(check, intervalMs).unref();
  }

  /** User-initiated check from the menu: always answers, even when there is nothing new. */
  async checkNow(): Promise<void> {
    if (this.downloadedVersion) {
      await this.promptRestart(true);
      return;
    }
    this.manualCheckPending = true;
    await this.runCheck();
  }

  private async runCheck(): Promise<void> {
    try {
      await this.deps.driver.checkForUpdates();
    } catch (error) {
      this.handleFailure(error);
    }
  }

  /** electron-updater both emits `error` and rejects, so only the first report counts. */
  private handleFailure(error: unknown): void {
    log.error('updater', 'update check failed', error);
    if (this.takeManualCheck()) {
      this.deps.notify({ kind: 'failed' });
    }
  }

  private takeManualCheck(): boolean {
    const pending = this.manualCheckPending;
    this.manualCheckPending = false;
    return pending;
  }

  private async promptRestart(force = false): Promise<void> {
    const version = this.downloadedVersion;
    if (!version || (!force && this.promptedVersion === version)) {
      return;
    }
    this.promptedVersion = version;
    if (await this.deps.confirmRestart(version)) {
      this.deps.driver.quitAndInstall(false, true);
    }
  }
}
