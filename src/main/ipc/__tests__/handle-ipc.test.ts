import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcMain } from 'electron';
import { err, ok } from '../../../shared/ipc/result';
import { fromMainWindow, fromMirrorWindow, handleIpc, handleOwnedDevice } from '../handle-ipc';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));

const registered = (index = 0) =>
  vi.mocked(ipcMain.handle).mock.calls[index]?.[1] as unknown as (
    event: unknown,
    payload?: unknown,
  ) => Promise<unknown>;

const event = (id: number) => ({ sender: { id } });

describe('handleIpc', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs the handler with the guard context, the event and the payload', async () => {
    const handler = vi.fn().mockResolvedValue(ok('done'));
    handleIpc('ch', () => ok({ extra: 1 }), handler);

    const e = event(1);
    const result = await registered()(e, { a: 1 });

    expect(ipcMain.handle).toHaveBeenCalledWith('ch', expect.any(Function));
    expect(handler).toHaveBeenCalledWith({ extra: 1, event: e, payload: { a: 1 } });
    expect(result).toEqual({ ok: true, value: 'done' });
  });

  it('returns the guard failure without running the handler', async () => {
    const handler = vi.fn();
    handleIpc('ch', () => err('nope'), handler);

    expect(await registered()(event(1))).toEqual({ ok: false, error: 'nope' });
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fromMainWindow turns mirror windows away', async () => {
    const windows = { isMirrorWindowSender: vi.fn((id: number) => id === 2) };
    const handler = vi.fn().mockResolvedValue(ok(undefined));
    handleIpc('ch', fromMainWindow(windows), handler);

    expect(await registered()(event(2))).toMatchObject({ ok: false });
    expect(handler).not.toHaveBeenCalled();
    expect(await registered()(event(1))).toEqual({ ok: true, value: undefined });
  });

  it('fromMirrorWindow only lets mirror windows through', async () => {
    const windows = { isMirrorWindowSender: vi.fn((id: number) => id === 2) };
    const handler = vi.fn().mockResolvedValue(ok(undefined));
    handleIpc('ch', fromMirrorWindow(windows), handler);

    expect(await registered()(event(1))).toEqual({
      ok: false,
      error: 'The requesting window cannot run QA actions.',
    });
    expect(await registered()(event(2))).toEqual({ ok: true, value: undefined });
  });

  describe('handleOwnedDevice', () => {
    const windows = { isSenderForDevice: vi.fn() };

    it('validates the device id before looking at the sender', async () => {
      handleOwnedDevice('ch', windows, vi.fn());

      expect(await registered()({}, { deviceId: '' })).toMatchObject({ ok: false });
      expect(windows.isSenderForDevice).not.toHaveBeenCalled();
    });

    it('rejects a sender that does not own the device', async () => {
      windows.isSenderForDevice.mockReturnValue(false);
      const handler = vi.fn();
      handleOwnedDevice('ch', windows, handler);

      expect(await registered()(event(9), { deviceId: 'emulator-5554' })).toEqual({
        ok: false,
        error: 'The requesting window is not allowed to control this device.',
      });
      expect(handler).not.toHaveBeenCalled();
    });

    it('hands the owner the device id, the body and its web contents', async () => {
      windows.isSenderForDevice.mockReturnValue(true);
      const handler = vi.fn().mockReturnValue(ok(1));
      handleOwnedDevice('ch', windows, handler);
      const e = event(5);

      const result = await registered()(e, { deviceId: ' emulator-5554 ', flag: true });

      expect(windows.isSenderForDevice).toHaveBeenCalledWith('emulator-5554', 5);
      expect(handler).toHaveBeenCalledWith({
        deviceId: 'emulator-5554',
        body: { deviceId: ' emulator-5554 ', flag: true },
        sender: e.sender,
      });
      expect(result).toEqual({ ok: true, value: 1 });
    });
  });
});
