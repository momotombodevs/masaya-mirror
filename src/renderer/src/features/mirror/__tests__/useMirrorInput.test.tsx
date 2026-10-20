// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import type { KeyboardEvent, PointerEvent, WheelEvent } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ANDROID_KEY_EVENT_ACTION,
  ANDROID_MOTION_EVENT_ACTION,
} from '../../../../../shared/mirror/types';
import type { MirrorControlMessage } from '../../../../../shared/mirror/types';
import { ANDROID_KEYCODE_BACK } from '../android-keycodes';
import { useMirrorInput } from '../useMirrorInput';

const sendControl = vi.fn<(deviceId: string, message: MirrorControlMessage) => Promise<unknown>>();
let frames: Array<() => void> = [];

/** A 200×400 canvas on screen showing a 1000×2000 video, so device = client × 5. */
function setup() {
  const canvas = document.createElement('canvas');
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 400 }) as DOMRect;
  const canvasRef = { current: canvas };
  const videoSizeRef = { current: { width: 1000, height: 2000 } };
  const hook = renderHook(() => useMirrorInput('device-1', canvasRef, videoSizeRef));
  return { canvas, videoSizeRef, handlers: hook.result.current, hook };
}

function pointerEvent(
  canvas: HTMLCanvasElement,
  init: { button?: number; clientX: number; clientY: number; captured?: boolean },
): PointerEvent<HTMLCanvasElement> {
  return {
    button: init.button ?? 0,
    clientX: init.clientX,
    clientY: init.clientY,
    pointerId: 7,
    preventDefault: vi.fn(),
    currentTarget: {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
      hasPointerCapture: () => init.captured ?? true,
      getBoundingClientRect: canvas.getBoundingClientRect,
    },
  } as unknown as PointerEvent<HTMLCanvasElement>;
}

function keyEvent(init: Partial<KeyboardEvent<HTMLDivElement>> & { key: string; code: string }) {
  return {
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    getModifierState: () => false,
    nativeEvent: { isComposing: false },
    preventDefault: vi.fn(),
    ...init,
  } as unknown as KeyboardEvent<HTMLDivElement>;
}

const sent = (): MirrorControlMessage[] => sendControl.mock.calls.map(([, message]) => message);

describe('useMirrorInput', () => {
  beforeEach(() => {
    sendControl.mockReset().mockResolvedValue({ ok: true, value: undefined });
    frames = [];
    vi.stubGlobal('manolo', { sendControl });
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => frames.push(callback));
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    // The hook calls `window.requestAnimationFrame`, which is the same object under jsdom.
    window.requestAnimationFrame = globalThis.requestAnimationFrame;
    window.cancelAnimationFrame = globalThis.cancelAnimationFrame;
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('maps a press to device coordinates and sends it to the owning device', () => {
    const { canvas, handlers } = setup();

    act(() => handlers.onPointerDown(pointerEvent(canvas, { clientX: 100, clientY: 200 })));

    expect(sendControl).toHaveBeenCalledWith('device-1', {
      type: 'touch',
      action: ANDROID_MOTION_EVENT_ACTION.down,
      pointerId: 7,
      pointerX: 500,
      pointerY: 1000,
      videoWidth: 1000,
      videoHeight: 2000,
      pressure: 1,
      buttons: 0,
      actionButton: 0,
    });
  });

  it('ignores pointer input until the video size is known', () => {
    const { canvas, handlers, videoSizeRef } = setup();
    videoSizeRef.current = { width: 0, height: 0 };

    act(() => handlers.onPointerDown(pointerEvent(canvas, { clientX: 10, clientY: 10 })));

    expect(sendControl).not.toHaveBeenCalled();
  });

  it('sends Back for the right mouse button instead of a touch', () => {
    const { canvas, handlers } = setup();
    const event = pointerEvent(canvas, { button: 2, clientX: 10, clientY: 10 });

    act(() => handlers.onPointerDown(event));

    expect(event.preventDefault).toHaveBeenCalled();
    expect(sent()).toEqual([
      expect.objectContaining({
        type: 'key',
        action: ANDROID_KEY_EVENT_ACTION.down,
        keyCode: ANDROID_KEYCODE_BACK,
      }),
      expect.objectContaining({
        type: 'key',
        action: ANDROID_KEY_EVENT_ACTION.up,
        keyCode: ANDROID_KEYCODE_BACK,
      }),
    ]);
  });

  it('coalesces drag moves to the latest one and flushes them before the release', () => {
    const { canvas, handlers } = setup();

    act(() => {
      handlers.onPointerDown(pointerEvent(canvas, { clientX: 0, clientY: 0 }));
      handlers.onPointerMove(pointerEvent(canvas, { clientX: 10, clientY: 10 }));
      handlers.onPointerMove(pointerEvent(canvas, { clientX: 20, clientY: 20 }));
    });
    expect(sendControl).toHaveBeenCalledTimes(1); // only the press so far

    act(() => handlers.onPointerUp(pointerEvent(canvas, { clientX: 20, clientY: 20 })));

    const actions = sent().map((message) => (message.type === 'touch' ? message.action : null));
    expect(actions).toEqual([
      ANDROID_MOTION_EVENT_ACTION.down,
      ANDROID_MOTION_EVENT_ACTION.move,
      ANDROID_MOTION_EVENT_ACTION.up,
    ]);
    expect(sent()[1]).toMatchObject({ pointerX: 100, pointerY: 100 });
  });

  it('does not send moves or releases for a pointer it never captured', () => {
    const { canvas, handlers } = setup();

    act(() => {
      handlers.onPointerMove(pointerEvent(canvas, { clientX: 5, clientY: 5, captured: false }));
      handlers.onPointerUp(pointerEvent(canvas, { clientX: 5, clientY: 5, captured: false }));
    });
    act(() => frames.forEach((frame) => frame()));

    expect(sendControl).not.toHaveBeenCalled();
  });

  it('scales wheel deltas by the video size', () => {
    const { handlers } = setup();

    act(() =>
      handlers.onWheel({
        clientX: 100,
        clientY: 200,
        deltaX: 0,
        deltaY: 100,
      } as WheelEvent<HTMLCanvasElement>),
    );

    expect(sent()[0]).toMatchObject({
      type: 'scroll',
      pointerX: 500,
      pointerY: 1000,
      scrollX: -0,
      scrollY: -100 / 2000,
    });
  });

  it('types printable characters as text, accents included, and ignores their key-up', () => {
    const { handlers } = setup();

    act(() => handlers.onKeyDown(keyEvent({ key: 'é', code: 'Quote' })));
    act(() => handlers.onKeyUp(keyEvent({ key: 'é', code: 'Quote' })));

    expect(sent()).toEqual([{ type: 'text', text: 'é' }]);
  });

  it('sends navigation keys as Android key codes with down and up', () => {
    const { handlers } = setup();
    const down = keyEvent({ key: 'Enter', code: 'Enter' });

    act(() => handlers.onKeyDown(down));
    act(() => handlers.onKeyUp(keyEvent({ key: 'Enter', code: 'Enter' })));

    expect(down.preventDefault).toHaveBeenCalled();
    expect(sent()).toEqual([
      { type: 'key', action: ANDROID_KEY_EVENT_ACTION.down, keyCode: 66, repeat: 0, metaState: 0 },
      { type: 'key', action: ANDROID_KEY_EVENT_ACTION.up, keyCode: 66, repeat: 0, metaState: 0 },
    ]);
  });

  it('leaves Escape and unmapped keys to the window', () => {
    const { handlers } = setup();
    const escape = keyEvent({ key: 'Escape', code: 'Escape' });
    const unmapped = keyEvent({ key: 'F13', code: 'F13' });

    act(() => {
      handlers.onKeyDown(escape);
      handlers.onKeyDown(unmapped);
    });

    expect(escape.preventDefault).not.toHaveBeenCalled();
    expect(unmapped.preventDefault).not.toHaveBeenCalled();
    expect(sendControl).not.toHaveBeenCalled();
  });

  it('does nothing when the preload bridge is missing', () => {
    vi.stubGlobal('manolo', undefined);
    const { canvas, handlers } = setup();

    expect(() =>
      act(() => handlers.onPointerDown(pointerEvent(canvas, { clientX: 1, clientY: 1 }))),
    ).not.toThrow();
  });

  it('releases the keys still held down when the window loses focus', () => {
    const { handlers } = setup();
    act(() => handlers.onKeyDown(keyEvent({ key: 'Enter', code: 'Enter' })));
    sendControl.mockClear();

    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(sent()).toEqual([
      { type: 'key', action: ANDROID_KEY_EVENT_ACTION.up, keyCode: 66, repeat: 0, metaState: 0 },
    ]);

    // The key-up that follows once focus is back would be a second release.
    act(() => window.dispatchEvent(new Event('blur')));
    expect(sendControl).toHaveBeenCalledTimes(1);
  });

  it('does not release a key that was already released', () => {
    const { handlers } = setup();
    act(() => handlers.onKeyDown(keyEvent({ key: 'Enter', code: 'Enter' })));
    act(() => handlers.onKeyUp(keyEvent({ key: 'Enter', code: 'Enter' })));
    sendControl.mockClear();

    act(() => window.dispatchEvent(new Event('blur')));

    expect(sendControl).not.toHaveBeenCalled();
  });

  it('delivers the pending move and releases held keys when the view goes away', () => {
    const { canvas, handlers, hook } = setup();
    act(() => {
      handlers.onKeyDown(keyEvent({ key: 'Enter', code: 'Enter' }));
      handlers.onPointerDown(pointerEvent(canvas, { clientX: 0, clientY: 0 }));
      handlers.onPointerMove(pointerEvent(canvas, { clientX: 10, clientY: 10 }));
    });
    sendControl.mockClear();

    hook.unmount();

    expect(sent()).toEqual([
      expect.objectContaining({ type: 'touch', action: ANDROID_MOTION_EVENT_ACTION.move }),
      expect.objectContaining({ type: 'key', action: ANDROID_KEY_EVENT_ACTION.up, keyCode: 66 }),
    ]);
    // A frame callback scheduled before unmount must not send anything later.
    act(() => frames.forEach((frame) => frame()));
    expect(sendControl).toHaveBeenCalledTimes(2);
  });

  it('survives a rejected bridge call', async () => {
    sendControl.mockRejectedValue(new Error('ipc closed'));
    const { canvas, handlers } = setup();

    // Vitest fails the run on an unhandled rejection, so reaching the end is the assertion.
    act(() => handlers.onPointerDown(pointerEvent(canvas, { clientX: 10, clientY: 10 })));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sendControl).toHaveBeenCalledOnce();
  });
});
