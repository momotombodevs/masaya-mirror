// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useApkInstall } from '../useApkInstall';

const installApk = vi.fn();
const getPathForFile = vi.fn((file: File) => `/downloads/${file.name}`);
const report = vi.fn();
const clear = vi.fn();

function dropEvent(type: 'dragover' | 'drop', files: File[], types = ['Files']): Event {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { types, files } });
  return event;
}

describe('useApkInstall', () => {
  beforeEach(() => {
    installApk.mockReset().mockResolvedValue({ ok: true, value: { installed: true } });
    report.mockClear();
    clear.mockClear();
    vi.stubGlobal('manolo', { installApk, getPathForFile });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('installs a dropped file by its path and reports success', async () => {
    renderHook(() => useApkInstall('device-1', report, clear));
    const file = new File(['x'], 'app.apk');

    await act(async () => {
      window.dispatchEvent(dropEvent('drop', [file]));
    });

    expect(installApk).toHaveBeenCalledWith('device-1', '/downloads/app.apk');
    expect(report.mock.calls.map(([message]) => message)).toEqual(['Instalando…', 'APK instalado']);
  });

  it('keeps the browser from opening a dragged file', () => {
    renderHook(() => useApkInstall('device-1', report, clear));
    const over = dropEvent('dragover', []);

    window.dispatchEvent(over);

    expect(over.defaultPrevented).toBe(true);
  });

  it('ignores drags that are not files', async () => {
    renderHook(() => useApkInstall('device-1', report, clear));
    const textDrag = dropEvent('drop', [], ['text/plain']);

    await act(async () => {
      window.dispatchEvent(textDrag);
    });

    expect(textDrag.defaultPrevented).toBe(false);
    expect(installApk).not.toHaveBeenCalled();
  });

  it('asks the main process for a file when none is given, and stays quiet if cancelled', async () => {
    installApk.mockResolvedValue({ ok: true, value: { installed: false } });
    const { result } = renderHook(() => useApkInstall('device-1', report, clear));

    await act(async () => result.current.install());

    expect(installApk).toHaveBeenCalledWith('device-1', undefined);
    expect(report).toHaveBeenLastCalledWith('Instalando…');
    expect(clear).toHaveBeenCalledOnce();
  });

  it('shows the error when the install fails', async () => {
    installApk.mockResolvedValue({ ok: false, error: 'INSTALL_FAILED_OLDER_SDK' });
    const { result } = renderHook(() => useApkInstall('device-1', report, clear));

    await act(async () => result.current.install());

    expect(report).toHaveBeenLastCalledWith('INSTALL_FAILED_OLDER_SDK');
    expect(result.current.installing).toBe(false);
  });

  it('shows an error instead of staying busy when the bridge call rejects', async () => {
    installApk.mockRejectedValue(new Error('ipc closed'));
    const { result } = renderHook(() => useApkInstall('device-1', report, clear));

    await act(async () => result.current.install());

    expect(report).toHaveBeenLastCalledWith('Sin conexión con la app. Reiníciala.');
    expect(result.current.installing).toBe(false);
  });

  it('refuses a second install while one is running', async () => {
    let finish: (value: unknown) => void = () => undefined;
    installApk.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { result } = renderHook(() => useApkInstall('device-1', report, clear));

    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.install();
    });
    await act(async () => result.current.install());
    expect(installApk).toHaveBeenCalledTimes(1);
    expect(result.current.installing).toBe(true);

    await act(async () => {
      finish({ ok: true, value: { installed: true } });
      await first;
    });
    expect(result.current.installing).toBe(false);
  });

  it('stops listening for drops on unmount', async () => {
    const { unmount } = renderHook(() => useApkInstall('device-1', report, clear));
    unmount();

    await act(async () => {
      window.dispatchEvent(dropEvent('drop', [new File(['x'], 'app.apk')]));
    });

    expect(installApk).not.toHaveBeenCalled();
  });
});
