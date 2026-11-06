// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invoke, channels } = vi.hoisted(() => ({
  invoke: vi.fn(),
  channels: [] as { onmessage: (data: unknown) => void }[],
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke,
  Channel: class {
    onmessage: (data: unknown) => void = () => undefined;
    constructor() {
      channels.push(this);
    }
  },
}));

import { registerMirrorPortHandler } from '../../../features/mirror/mirror-port-delivery';
import { createTauriApi, NOT_YET_IN_TAURI } from '../tauri-api';

beforeEach(() => {
  invoke.mockReset();
  channels.length = 0;
  window.localStorage.clear();
});

describe('Tauri API commands', () => {
  it('calls the snake_case command with camelCase arguments', async () => {
    invoke.mockResolvedValue({ ok: true, value: { message: 'x' } });
    await createTauriApi().setDeviceSetting('R5CT', 'showTouches', true);
    expect(invoke).toHaveBeenCalledWith('set_device_setting', {
      deviceId: 'R5CT',
      key: 'showTouches',
      enabled: true,
    });
  });

  it('passes a result through untouched, including the ADB_NOT_FOUND code', async () => {
    const failed = { ok: false, error: 'ADB no encontrado.', code: 'ADB_NOT_FOUND' };
    invoke.mockResolvedValue(failed);
    expect(await createTauriApi().listDevices()).toEqual(failed);
  });

  it('turns a rejected call into a failed result instead of throwing', async () => {
    invoke.mockRejectedValue(new Error('command list_devices not found'));
    expect(await createTauriApi().listDevices()).toEqual({
      ok: false,
      error: 'command list_devices not found',
    });
  });

  it('says plainly what the shell has not ported yet', async () => {
    const api = createTauriApi();
    expect(await api.saveCapture(new ArrayBuffer(1))).toEqual({
      ok: false,
      error: NOT_YET_IN_TAURI,
    });
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('Tauri API mirror stream', () => {
  it('delivers a port that receives the decoded frames of the channel', async () => {
    invoke.mockResolvedValue({ ok: true, value: { metadata: {}, audioEnabled: false } });
    const received = new Promise<MessagePort>((resolve) => {
      registerMirrorPortHandler('d1', resolve);
    });

    const result = await createTauriApi().openMirror('d1');
    expect(result.ok).toBe(true);
    expect(invoke).toHaveBeenCalledWith('open_mirror', {
      deviceId: 'd1',
      options: undefined,
      onStream: channels[0],
    });

    const port = await received;
    const message = new Promise<unknown>((resolve) => {
      port.onmessage = (event): void => resolve(event.data);
    });
    // A keyframe of the video track, pts 1, payload [9].
    channels[0]?.onmessage(new Uint8Array([2, 1, 0, 0, 0, 0, 0, 0, 0, 1, 9]).buffer);

    // Compared as plain arrays: the clone crosses from Node's realm into jsdom's.
    const delivered = (await message) as { packet: { data: Uint8Array } };
    expect(delivered).toMatchObject({
      kind: 'packet',
      stream: 'video',
      packet: { type: 'data', keyframe: true, pts: 1n },
    });
    expect(Array.from(delivered.packet.data)).toEqual([9]);
    port.close();
  });

  it('does not deliver a port when the mirror could not start', async () => {
    invoke.mockResolvedValue({ ok: false, error: 'boom' });
    const handler = vi.fn();
    const unregister = registerMirrorPortHandler('d2', handler);

    const result = await createTauriApi().setMirrorOptions('d2', {
      maxSize: 1920,
      videoBitRate: 16_000_000,
      videoCodec: 'h264',
      audioEnabled: false,
      clipboardSync: true,
    });

    expect(result).toEqual({ ok: false, error: 'boom' });
    expect(handler).not.toHaveBeenCalled();
    unregister();
  });
});

describe('Tauri API preferences', () => {
  it('starts from the defaults and keeps what is saved', async () => {
    const api = createTauriApi();
    const first = await api.getPreferences();
    expect(first).toMatchObject({ ok: true, value: { language: 'system', audio: false } });

    await api.setPreferences({ audio: true });
    expect(await createTauriApi().getPreferences()).toMatchObject({
      ok: true,
      value: { audio: true, language: 'system' },
    });
  });

  it('rejects an invalid patch without saving it', async () => {
    const api = createTauriApi();
    const result = await api.setPreferences({ mirror: { maxSize: 1 } } as never);
    expect(result.ok).toBe(false);
    expect(window.localStorage.getItem('masaya.preferences')).toBeNull();
  });
});
