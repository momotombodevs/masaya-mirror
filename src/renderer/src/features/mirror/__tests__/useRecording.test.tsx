// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRecording } from '../useRecording';

const saveRecording = vi.fn();
const showStatus = vi.fn();
const canvas = document.createElement('canvas');
const trackStop = vi.fn();

class FakeRecorder {
  static instances: FakeRecorder[] = [];
  static supported = new Set<string>();
  static isTypeSupported = (type: string): boolean => FakeRecorder.supported.has(type);
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => Promise<void>) | null = null;
  state = 'recording';
  constructor(
    readonly stream: unknown,
    readonly options: { mimeType: string },
  ) {
    FakeRecorder.instances.push(this);
  }
  start = vi.fn();
  stop = vi.fn(() => {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['video']) });
    void this.onstop?.();
  });
}

describe('useRecording', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    FakeRecorder.instances = [];
    FakeRecorder.supported = new Set(['video/mp4;codecs=avc1', 'video/webm']);
    saveRecording.mockResolvedValue({ ok: true, value: { saved: true } });
    vi.stubGlobal('masaya', { saveRecording });
    vi.stubGlobal('MediaRecorder', FakeRecorder);
    trackStop.mockClear();
    canvas.captureStream = vi.fn(
      () => ({ getTracks: () => [{ stop: trackStop }] }) as unknown as MediaStream,
    );
    // jsdom's Blob has no arrayBuffer().
    Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob) {
      return Promise.resolve(new ArrayBuffer(this.size));
    };
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('records MP4 and saves it with its type', async () => {
    const { result } = renderHook(() => useRecording(canvas, showStatus, 'video'));

    await act(() => result.current.toggle());
    expect(result.current.recording).toBe(true);
    expect(FakeRecorder.instances[0]?.options.mimeType).toBe('video/mp4;codecs=avc1');

    await act(() => result.current.toggle());

    await vi.waitFor(() =>
      expect(saveRecording).toHaveBeenCalledWith(expect.any(ArrayBuffer), 'video/mp4;codecs=avc1'),
    );
    expect(result.current.recording).toBe(false);
    expect(showStatus).toHaveBeenLastCalledWith('Video guardado');
  });

  it('falls back to WebM when the system cannot record MP4', async () => {
    FakeRecorder.supported = new Set(['video/webm']);
    const { result } = renderHook(() => useRecording(canvas, showStatus));

    await act(() => result.current.toggle());

    expect(FakeRecorder.instances[0]?.options.mimeType).toBe('video/webm');
  });

  it('says so when no video type can be recorded, and does not start', async () => {
    FakeRecorder.supported = new Set();
    const { result } = renderHook(() => useRecording(canvas, showStatus));

    await act(() => result.current.toggle());

    expect(result.current.recording).toBe(false);
    expect(showStatus).toHaveBeenCalledWith(
      'Este sistema no puede grabar video. Elige GIF en Ajustes.',
    );
  });

  it('refuses to record before the mirror has a canvas', async () => {
    const { result } = renderHook(() => useRecording(null, showStatus));

    await act(() => result.current.toggle());

    expect(showStatus).toHaveBeenCalledWith('Aún no hay imagen');
    expect(FakeRecorder.instances).toHaveLength(0);
  });

  it('stops the recorder and the capture when the window closes mid-recording', async () => {
    const { result, unmount } = renderHook(() => useRecording(canvas, showStatus, 'video'));
    await act(() => result.current.toggle());

    unmount();

    expect(FakeRecorder.instances[0]?.stop).toHaveBeenCalledTimes(1);
    expect(trackStop).toHaveBeenCalledTimes(1);
    expect(saveRecording).not.toHaveBeenCalled();
  });

  it('reports a failed save instead of throwing', async () => {
    saveRecording.mockRejectedValue(new Error('disk full'));
    const { result } = renderHook(() => useRecording(canvas, showStatus, 'video'));
    await act(() => result.current.toggle());

    await act(() => result.current.toggle());

    await vi.waitFor(() =>
      expect(showStatus).toHaveBeenCalledWith('No se pudo guardar la grabación'),
    );
    expect(result.current.recording).toBe(false);
  });
});
