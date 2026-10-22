import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UpdaterService, type UpdateDriver, type UpdateNotice } from '../updater.service';

class FakeDriver implements UpdateDriver {
  autoDownload = false;
  autoInstallOnAppQuit = false;
  checkForUpdates = vi.fn(() => Promise.resolve(undefined));
  quitAndInstall = vi.fn();
  private listeners = new Map<string, (arg: never) => void>();

  on(event: string, listener: (arg: never) => void): this {
    this.listeners.set(event, listener);
    return this;
  }

  emit(event: string, arg?: unknown): void {
    this.listeners.get(event)?.(arg as never);
  }
}

function setup(confirm = true) {
  const driver = new FakeDriver();
  const notify = vi.fn<(notice: UpdateNotice) => void>();
  const confirmRestart = vi.fn(() => Promise.resolve(confirm));
  const service = new UpdaterService({
    driver,
    notify,
    confirmRestart,
    startDelayMs: 1_000,
    intervalMs: 10_000,
  });
  return { driver, notify, confirmRestart, service };
}

describe('UpdaterService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('downloads in the background and installs on quit', () => {
    const { driver } = setup();

    expect(driver.autoDownload).toBe(true);
    expect(driver.autoInstallOnAppQuit).toBe(true);
  });

  it('checks once after the start delay and then periodically', async () => {
    const { driver, service } = setup();
    service.start();

    await vi.advanceTimersByTimeAsync(999);
    expect(driver.checkForUpdates).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(driver.checkForUpdates).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(driver.checkForUpdates).toHaveBeenCalledTimes(2);
  });

  it('stays silent in background checks that find nothing or fail', async () => {
    const { driver, notify, service } = setup();
    service.start();
    await vi.advanceTimersByTimeAsync(1_000);

    driver.emit('update-not-available', { version: '1.0.0' });
    driver.emit('error', new Error('offline'));

    expect(notify).not.toHaveBeenCalled();
  });

  it('tells the user the result of a manual check', async () => {
    const { driver, notify, service } = setup();

    await service.checkNow();
    driver.emit('update-not-available', { version: '1.0.0' });
    expect(notify).toHaveBeenLastCalledWith({ kind: 'upToDate' });

    await service.checkNow();
    driver.emit('update-available', { version: '1.1.0' });
    expect(notify).toHaveBeenLastCalledWith({ kind: 'available', version: '1.1.0' });
  });

  it('reports a failed manual check once even if it both emits and rejects', async () => {
    const { driver, notify, service } = setup();
    driver.checkForUpdates.mockImplementation(() => {
      driver.emit('error', new Error('offline'));
      return Promise.reject(new Error('offline'));
    });

    await service.checkNow();

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith({ kind: 'failed' });
  });

  it('restarts to install when the user accepts', () => {
    const { driver, confirmRestart } = setup(true);

    driver.emit('update-downloaded', { version: '1.1.0' });

    expect(confirmRestart).toHaveBeenCalledWith('1.1.0');
    return vi.waitFor(() => expect(driver.quitAndInstall).toHaveBeenCalledWith(false, true));
  });

  it('does not repeat the prompt for a declined version, except on a manual check', async () => {
    const { driver, confirmRestart, service } = setup(false);

    driver.emit('update-downloaded', { version: '1.1.0' });
    await vi.waitFor(() => expect(confirmRestart).toHaveBeenCalledTimes(1));
    driver.emit('update-downloaded', { version: '1.1.0' });
    expect(confirmRestart).toHaveBeenCalledTimes(1);
    expect(driver.quitAndInstall).not.toHaveBeenCalled();

    await service.checkNow();
    expect(confirmRestart).toHaveBeenCalledTimes(2);
    expect(driver.checkForUpdates).not.toHaveBeenCalled();
  });
});
