import {
  useCallback,
  useMemo,
  useRef,
  type KeyboardEvent,
  type MutableRefObject,
  type PointerEvent,
  type WheelEvent,
} from 'react';
import {
  ANDROID_KEY_EVENT_ACTION,
  ANDROID_MOTION_EVENT_ACTION,
  type MirrorControlMessage,
} from '../../../../shared/mirror/types';
import { getManoloApi } from '../../shared/manolo-api';
import { ANDROID_KEYCODE_BACK, resolveKeyInput } from './android-keycodes';
import { createControlCoalescer, type ControlCoalescer } from './control-coalescer';

export type VideoSize = { width: number; height: number };

export type MirrorInputHandlers = {
  readonly onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => void;
  readonly onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => void;
  readonly onPointerUp: (event: PointerEvent<HTMLCanvasElement>) => void;
  readonly onWheel: (event: WheelEvent<HTMLCanvasElement>) => void;
  readonly onContextMenu: (event: PointerEvent<HTMLCanvasElement>) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  readonly onKeyUp: (event: KeyboardEvent<HTMLDivElement>) => void;
};

const MOUSE_BUTTON_RIGHT = 2;

/** Translates pointer/keyboard events into scrcpy control messages for a device. */
export function useMirrorInput(
  deviceId: string,
  canvasRef: MutableRefObject<HTMLCanvasElement | null>,
  videoSizeRef: MutableRefObject<VideoSize>,
): MirrorInputHandlers {
  const sendControl = useCallback(
    (message: MirrorControlMessage): void => {
      const api = getManoloApi();
      if (!api) {
        return;
      }
      void api.sendControl(deviceId, message);
    },
    [deviceId],
  );

  // Moves are coalesced to one message per animation frame. Press and release
  // flush the pending move first, so the device always receives events in order.
  const moveCoalescer: ControlCoalescer<MirrorControlMessage> = useMemo(
    () =>
      createControlCoalescer(sendControl, {
        schedule: (callback) => window.requestAnimationFrame(callback),
        cancel: (handle) => window.cancelAnimationFrame(handle as number),
      }),
    [sendControl],
  );

  const mapPointerToDevice = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const canvas = canvasRef.current;
      const { width, height } = videoSizeRef.current;
      if (!canvas || width === 0 || height === 0) {
        return null;
      }
      const rect = canvas.getBoundingClientRect();
      const x = Math.round(((clientX - rect.left) / rect.width) * width);
      const y = Math.round(((clientY - rect.top) / rect.height) * height);
      return { x, y };
    },
    [canvasRef, videoSizeRef],
  );

  const buildTouch = useCallback(
    (
      action: number,
      pointerId: number,
      clientX: number,
      clientY: number,
      pressure: number,
    ): MirrorControlMessage | null => {
      const coords = mapPointerToDevice(clientX, clientY);
      if (!coords) {
        return null;
      }
      const { width, height } = videoSizeRef.current;
      return {
        type: 'touch',
        action,
        pointerId,
        pointerX: coords.x,
        pointerY: coords.y,
        videoWidth: width,
        videoHeight: height,
        pressure,
        buttons: 0,
        actionButton: 0,
      };
    },
    [mapPointerToDevice, videoSizeRef],
  );

  const sendBack = useCallback((): void => {
    moveCoalescer.flush();
    sendControl({
      type: 'key',
      action: ANDROID_KEY_EVENT_ACTION.down,
      keyCode: ANDROID_KEYCODE_BACK,
      repeat: 0,
      metaState: 0,
    });
    sendControl({
      type: 'key',
      action: ANDROID_KEY_EVENT_ACTION.up,
      keyCode: ANDROID_KEYCODE_BACK,
      repeat: 0,
      metaState: 0,
    });
  }, [moveCoalescer, sendControl]);

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLCanvasElement>): void => {
      if (event.button === MOUSE_BUTTON_RIGHT) {
        event.preventDefault();
        sendBack();
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      const message = buildTouch(
        ANDROID_MOTION_EVENT_ACTION.down,
        event.pointerId,
        event.clientX,
        event.clientY,
        1,
      );
      if (message) {
        moveCoalescer.flush();
        sendControl(message);
      }
    },
    [buildTouch, moveCoalescer, sendBack, sendControl],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLCanvasElement>): void => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
        return;
      }
      const message = buildTouch(
        ANDROID_MOTION_EVENT_ACTION.move,
        event.pointerId,
        event.clientX,
        event.clientY,
        1,
      );
      if (message) {
        moveCoalescer.submit(message);
      }
    },
    [buildTouch, moveCoalescer],
  );

  const onPointerUp = useCallback(
    (event: PointerEvent<HTMLCanvasElement>): void => {
      const message = buildTouch(
        ANDROID_MOTION_EVENT_ACTION.up,
        event.pointerId,
        event.clientX,
        event.clientY,
        0,
      );
      if (message) {
        moveCoalescer.flush();
        sendControl(message);
      }
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [buildTouch, moveCoalescer, sendControl],
  );

  const onContextMenu = useCallback((event: PointerEvent<HTMLCanvasElement>): void => {
    event.preventDefault();
  }, []);

  const onWheel = useCallback(
    (event: WheelEvent<HTMLCanvasElement>): void => {
      const coords = mapPointerToDevice(event.clientX, event.clientY);
      const { width, height } = videoSizeRef.current;
      if (!coords) {
        return;
      }
      sendControl({
        type: 'scroll',
        pointerX: coords.x,
        pointerY: coords.y,
        videoWidth: width,
        videoHeight: height,
        scrollX: -event.deltaX / width,
        scrollY: -event.deltaY / height,
        buttons: 0,
      });
    },
    [mapPointerToDevice, sendControl, videoSizeRef],
  );

  // Codes whose key-down was sent as text. Their key-up must not send a key code.
  const textKeyCodesRef = useRef(new Set<string>());

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>): void => {
      if (event.key === 'Escape') {
        return;
      }
      const resolved = resolveKeyInput(event);
      if (!resolved) {
        return;
      }
      event.preventDefault();
      if (resolved.kind === 'text') {
        textKeyCodesRef.current.add(event.code);
        sendControl({ type: 'text', text: resolved.text });
        return;
      }
      sendControl({
        type: 'key',
        action: ANDROID_KEY_EVENT_ACTION.down,
        keyCode: resolved.keyCode,
        repeat: 0,
        metaState: resolved.metaState,
      });
    },
    [sendControl],
  );

  const onKeyUp = useCallback(
    (event: KeyboardEvent<HTMLDivElement>): void => {
      if (textKeyCodesRef.current.delete(event.code)) {
        return;
      }
      const resolved = resolveKeyInput(event);
      if (!resolved || resolved.kind !== 'keycode') {
        return;
      }
      sendControl({
        type: 'key',
        action: ANDROID_KEY_EVENT_ACTION.up,
        keyCode: resolved.keyCode,
        repeat: 0,
        metaState: resolved.metaState,
      });
    },
    [sendControl],
  );

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onWheel,
    onContextMenu,
    onKeyDown,
    onKeyUp,
  };
}
