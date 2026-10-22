import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clipboard, ipcMain, shell } from 'electron';
import { ok } from '../../../../shared/ipc/result';
import { DIAGNOSTICS_CHANNELS } from '../../../../shared/ipc/diagnostics.contract';
import { initLogFile } from '../../../logging/log';
import { registerDiagnosticsIpcHandlers } from '../ipc/diagnostics.handlers';

vi.mock('electron', () => ({
  app: { getVersion: () => '0.3.1', isPackaged: true },
  ipcMain: { handle: vi.fn() },
  clipboard: { writeText: vi.fn() },
  shell: { openPath: vi.fn() },
}));

describe('registerDiagnosticsIpcHandlers', () => {
  const mirrorWindowService = { isMirrorWindowSender: vi.fn() };
  const adbService = {
    getExecutablePath: vi.fn(),
    getVersion: vi.fn(),
    listDevices: vi.fn(),
  };

  const invoke = (channel: string): Promise<unknown> => {
    const handler = vi.mocked(ipcMain.handle).mock.calls.find(([name]) => name === channel)?.[1];
    return Promise.resolve(handler?.({ sender: { id: 3 } } as never, undefined));
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Electron adds this to `process`; plain Node does not have it.
    Object.assign(process, { getSystemVersion: () => '15.1' });
    mirrorWindowService.isMirrorWindowSender.mockReturnValue(true);
    adbService.getExecutablePath.mockResolvedValue('/usr/local/bin/adb');
    adbService.getVersion.mockResolvedValue(ok('Android Debug Bridge version 1.0.41'));
    adbService.listDevices.mockResolvedValue(
      ok([{ id: 'R5CW1234', status: 'device', displayName: 'Galaxy S23 Ultra' }]),
    );
    initLogFile('/nonexistent/masaya-logs');
    registerDiagnosticsIpcHandlers(adbService as never, mirrorWindowService as never);
  });

  it('copies a report with adb and the connected phones to the clipboard', async () => {
    await expect(invoke(DIAGNOSTICS_CHANNELS.copyReport)).resolves.toEqual(ok(undefined));

    const report = vi.mocked(clipboard.writeText).mock.calls[0]?.[0] ?? '';
    expect(report).toContain('Masaya 0.3.1');
    expect(report).toContain('adb: /usr/local/bin/adb');
    expect(report).toContain('  - Galaxy S23 Ultra · R5CW1234 · device');
  });

  it('opens the log folder, or reports why it could not', async () => {
    vi.mocked(shell.openPath).mockResolvedValueOnce('').mockResolvedValueOnce('No access');

    await expect(invoke(DIAGNOSTICS_CHANNELS.openLogFolder)).resolves.toEqual(ok(undefined));
    await expect(invoke(DIAGNOSTICS_CHANNELS.openLogFolder)).resolves.toEqual({
      ok: false,
      error: 'No access',
    });
    expect(shell.openPath).toHaveBeenCalledWith('/nonexistent/masaya-logs');
  });

  it('turns away windows other than a mirror window', async () => {
    mirrorWindowService.isMirrorWindowSender.mockReturnValue(false);

    const result = await invoke(DIAGNOSTICS_CHANNELS.copyReport);

    expect(result).toMatchObject({ ok: false });
    expect(clipboard.writeText).not.toHaveBeenCalled();
  });
});
