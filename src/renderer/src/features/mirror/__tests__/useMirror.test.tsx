// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MIRROR_OPTIONS } from '../../../../../shared/mirror/types';
import { useMirror } from '../useMirror';

const disposeMirrorStreamClient = vi.hoisted(() => vi.fn());
vi.mock('../mirror-stream.client', () => ({ disposeMirrorStreamClient }));

const openMirror = vi.fn();
const closeMirror = vi.fn();
const setMirrorOptions = vi.fn();
const getMirrorStatus = vi.fn();

const okResult = { ok: true, value: { metadata: {}, audioEnabled: true } };

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('useMirror', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMirrorStatus.mockResolvedValue({ ok: true, value: { activeDeviceIds: ['device-1'] } });
    openMirror.mockResolvedValue(okResult);
    closeMirror.mockResolvedValue({ ok: true, value: undefined });
    setMirrorOptions.mockResolvedValue(okResult);
    vi.stubGlobal('manolo', { openMirror, closeMirror, setMirrorOptions, getMirrorStatus });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('opens the mirror with the given options and refreshes the status', async () => {
    const { result } = renderHook(() => useMirror('device-1'));
    const options = { ...DEFAULT_MIRROR_OPTIONS, maxSize: 1024 };

    let opened = false;
    await act(async () => {
      opened = await result.current.openMirror(undefined, options);
    });

    expect(opened).toBe(true);
    expect(openMirror).toHaveBeenCalledWith('device-1', options);
    expect(result.current.options).toEqual(options);
    expect(result.current.loading).toBe(false);
    await waitFor(() => expect(result.current.isMirrorActive).toBe(true));
  });

  it('shows the error and keeps the old options when the call fails', async () => {
    openMirror.mockResolvedValue({ ok: false, error: 'scrcpy died' });
    const { result } = renderHook(() => useMirror('device-1'));

    await act(async () => {
      expect(await result.current.openMirror()).toBe(false);
    });

    expect(result.current.error).toBe('scrcpy died');
    expect(result.current.options).toEqual(DEFAULT_MIRROR_OPTIONS);
    expect(result.current.loading).toBe(false);
  });

  it('never stays loading when the bridge call rejects', async () => {
    setMirrorOptions.mockRejectedValue(new Error('ipc closed'));
    const { result } = renderHook(() => useMirror('device-1'));

    await act(async () => {
      expect(await result.current.applyOptions(DEFAULT_MIRROR_OPTIONS)).toBe(false);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('API de Manolo Mirror no disponible.');
  });

  it('reports a missing bridge as an error', async () => {
    vi.stubGlobal('manolo', undefined);
    const { result } = renderHook(() => useMirror('device-1'));

    await act(async () => {
      expect(await result.current.closeMirror()).toBe(false);
    });

    expect(result.current.error).toBe('API de Manolo Mirror no disponible.');
  });

  it('stays loading until every running operation has finished', async () => {
    const slow = deferred<unknown>();
    const fast = deferred<unknown>();
    setMirrorOptions.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);
    const { result } = renderHook(() => useMirror('device-1'));

    let first: Promise<boolean> = Promise.resolve(false);
    let second: Promise<boolean> = Promise.resolve(false);
    act(() => {
      first = result.current.applyOptions(DEFAULT_MIRROR_OPTIONS);
      second = result.current.applyOptions(DEFAULT_MIRROR_OPTIONS);
    });
    expect(result.current.loading).toBe(true);

    await act(async () => {
      fast.resolve(okResult);
      await second;
    });
    expect(result.current.loading).toBe(true);

    await act(async () => {
      slow.resolve(okResult);
      await first;
    });
    expect(result.current.loading).toBe(false);
  });

  it('drops the stream client of the device when it is closed', async () => {
    const { result } = renderHook(() => useMirror('device-1'));

    await act(async () => {
      await result.current.closeMirror();
    });

    expect(closeMirror).toHaveBeenCalledWith('device-1');
    expect(disposeMirrorStreamClient).toHaveBeenCalledWith('device-1');
  });
});
