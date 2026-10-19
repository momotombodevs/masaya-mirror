// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MirrorStreamInitMessage } from '../../../../../shared/mirror/types';
import { useMirrorDecoder } from '../useMirrorDecoder';

type Subscriber = {
  onInit: (message: MirrorStreamInitMessage) => void;
  onVideoPacket: (packet: unknown) => void;
  onAudioPacket: (packet: unknown) => void;
  onClose: (message: unknown) => void;
};

const hoisted = vi.hoisted(() => ({
  decoders: [] as Array<{
    dispose: ReturnType<typeof vi.fn>;
    emitSize: (w: number, h: number) => void;
  }>,
  supported: { value: true },
  streamState: {
    value: { portStatus: 'connected', init: null, lastError: null } as {
      portStatus: string;
      init: null;
      lastError: string | null;
    },
  },
}));

vi.mock('@yume-chan/scrcpy-decoder-webcodecs', () => ({
  BitmapVideoFrameRenderer: class {},
  WebCodecsVideoDecoder: class {
    static get isSupported(): boolean {
      return hoisted.supported.value;
    }
    writable = new WritableStream();
    dispose = vi.fn().mockResolvedValue(undefined);
    private sizeListener: ((size: { width: number; height: number }) => void) | null = null;
    constructor() {
      hoisted.decoders.push({
        dispose: this.dispose,
        emitSize: (width, height) => this.sizeListener?.({ width, height }),
      });
    }
    sizeChanged(listener: (size: { width: number; height: number }) => void): void {
      this.sizeListener = listener;
    }
  },
}));

let subscriber: Subscriber | null = null;
const unsubscribe = vi.fn();

vi.mock('../mirror-stream.client', () => ({
  getMirrorStreamClient: () => ({
    subscribe: (handlers: Subscriber) => {
      subscriber = handlers;
      return unsubscribe;
    },
  }),
  useMirrorStream: () => hoisted.streamState.value,
}));

const setMirrorVideoLayout = vi.fn().mockResolvedValue({ ok: true, value: undefined });

const init = (width: number, height: number): MirrorStreamInitMessage => ({
  kind: 'init',
  deviceId: 'device-1',
  video: { codec: 1 as MirrorStreamInitMessage['video']['codec'], width, height },
  audioCodec: null,
  audioWebCodecId: null,
});

function render(options: Parameters<typeof useMirrorDecoder>[2] = {}) {
  const canvasRef = { current: document.createElement('canvas') };
  return renderHook(() => useMirrorDecoder('device-1', canvasRef, options));
}

describe('useMirrorDecoder', () => {
  beforeEach(() => {
    hoisted.decoders.length = 0;
    hoisted.supported.value = true;
    hoisted.streamState.value = { portStatus: 'connected', init: null, lastError: null };
    subscriber = null;
    unsubscribe.mockReset();
    setMirrorVideoLayout.mockClear();
    vi.stubGlobal('manolo', { setMirrorVideoLayout });
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('creates a decoder on init and tells the main process the video size', () => {
    const { result } = render();

    act(() => subscriber?.onInit(init(1080, 2400)));

    expect(hoisted.decoders).toHaveLength(1);
    expect(result.current.ready).toBe(true);
    expect(result.current.videoSizeRef.current).toEqual({ width: 1080, height: 2400 });
    expect(setMirrorVideoLayout).toHaveBeenCalledWith('device-1', 1080, 2400);
  });

  it('ignores an init addressed to another device', () => {
    const { result } = render();

    act(() => subscriber?.onInit({ ...init(1080, 2400), deviceId: 'other' }));

    expect(hoisted.decoders).toHaveLength(0);
    expect(result.current.ready).toBe(false);
  });

  it('replaces the decoder when the stream restarts, e.g. after a quality change', () => {
    render();

    act(() => subscriber?.onInit(init(1080, 2400)));
    act(() => subscriber?.onInit(init(720, 1600)));

    expect(hoisted.decoders).toHaveLength(2);
    expect(hoisted.decoders[0]?.dispose).toHaveBeenCalledOnce();
    expect(hoisted.decoders[1]?.dispose).not.toHaveBeenCalled();
  });

  it('follows size changes reported by the decoder', () => {
    const onSizeChange = vi.fn();
    const { result } = render({ onSizeChange });
    act(() => subscriber?.onInit(init(1080, 2400)));

    act(() => hoisted.decoders[0]?.emitSize(2400, 1080));

    expect(result.current.videoSizeRef.current).toEqual({ width: 2400, height: 1080 });
    expect(onSizeChange).toHaveBeenCalledWith(2400, 1080);
    expect(setMirrorVideoLayout).toHaveBeenLastCalledWith('device-1', 2400, 1080);
  });

  it('reports unsupported video instead of creating a decoder', () => {
    hoisted.supported.value = false;
    const { result } = render();

    act(() => subscriber?.onInit(init(1080, 2400)));

    expect(hoisted.decoders).toHaveLength(0);
    expect(result.current.streamError).toBe('Video no compatible con este sistema.');
  });

  it('asks the window to close when the stream ends', () => {
    const onClose = vi.fn();
    render({ onClose });

    act(() => subscriber?.onClose({ kind: 'close' }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('flags a missing signal when no init arrives in time', () => {
    const { result } = render();

    act(() => {
      vi.advanceTimersByTime(15_000);
    });

    expect(result.current.streamError).toBe('Sin señal de video.');
  });

  it('does not flag a missing signal once the video started', () => {
    const { result } = render();
    act(() => subscriber?.onInit(init(1080, 2400)));

    act(() => {
      vi.advanceTimersByTime(15_000);
    });

    expect(result.current.streamError).toBeNull();
  });

  it('disposes the decoder, unsubscribes and does not report a close on unmount', () => {
    const onClose = vi.fn();
    const { unmount } = render({ onClose });
    act(() => subscriber?.onInit(init(1080, 2400)));

    unmount();
    subscriber?.onClose({ kind: 'close' });

    expect(hoisted.decoders[0]?.dispose).toHaveBeenCalledOnce();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('surfaces stream errors from the client', () => {
    hoisted.streamState.value = { portStatus: 'closed', init: null, lastError: 'Puerto cerrado' };

    const { result } = render();

    expect(result.current.streamError).toBe('Puerto cerrado');
  });
});
