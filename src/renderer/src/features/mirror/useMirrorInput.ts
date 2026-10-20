import {
  useCallback,
  useEffect,
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
import { callApi } from '../../shared/manolo-api';
import { ANDROID_KEYCODE_BACK, resolveKeyInput, type KeyInput } from './android-keycodes';
import { createControlCoalescer, type ControlCoalescer } from './control-coalescer';
import { keyEvent, keyPressMessages } from './key-press';

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

function toKeyInput(event: KeyboardEvent<HTMLDivElement>): KeyInput {
  return {
    key: event.key,
    code: event.code,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    altGraph: event.getModifierState('AltGraph'),
    composing: event.nativeEvent.isComposing,
  };
}

/** Translates pointer/keyboard events into scrcpy control messages for a device. */
export function useMirrorInput(
  deviceId: string,
  canvasRef: MutableRefObject<HTMLCanvasElement | null>,
  videoSizeRef: MutableRefObject<VideoSize>,
): MirrorInputHandlers {
  // A single lost input event (touch move, key) is not worth interrupting the user for, so the
  // Result is dropped on purpose; callApi keeps a rejection from becoming an unhandled one.
  const sendControl = useCallback(
    (message: MirrorControlMessage): void => {
      void callApi((api) => api.sendControl(deviceId, message), '');
    },
    [deviceId],
  );

  // Moves are coalesced to one message per animation frame. Press and release
  // flush the pending move first, so the device always receives events in order.
  const moveCoalescer: ControlCoalescer<MirrorControlMessage> = useMemo(
    () =>
      createControlCoalescer(
        sendControl,
        {
          schedule: (callback) => window.requestAnimationFrame(callback),
          cancel: (handle) => window.cancelAnimationFrame(handle as number),
        },
        (message) => (message.type === 'touch' ? message.pointerId : message.type),
      ),
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
    keyPressMessages(ANDROID_KEYCODE_BACK).forEach(sendControl);
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
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
        return;
      }
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
      event.currentTarget.releasePointerCapture(event.pointerId);
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
  // Keys pressed on the device and not yet released, by physical key (`event.code`).
  const heldKeysRef = useRef(new Map<string, { keyCode: number; metaState: number }>());

  // When the window loses focus the key-up never arrives; losing the device's keys held down
  // would leave them stuck. The same cleanup runs when the device changes or the view closes,
  // and delivers the last pending move first so a drag ends where the finger was.
  useEffect(() => {
    const releaseHeldKeys = (): void => {
      for (const { keyCode, metaState } of heldKeysRef.current.values()) {
        sendControl(keyEvent(ANDROID_KEY_EVENT_ACTION.up, keyCode, metaState));
      }
      heldKeysRef.current.clear();
      textKeyCodesRef.current.clear();
    };
    window.addEventListener('blur', releaseHeldKeys);
    return () => {
      window.removeEventListener('blur', releaseHeldKeys);
      moveCoalescer.flush();
      releaseHeldKeys();
    };
  }, [moveCoalescer, sendControl]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>): void => {
      if (event.key === 'Escape') {
        return;
      }
      const resolved = resolveKeyInput(toKeyInput(event));
      if (!resolved) {
        return;
      }
      event.preventDefault();
      if (resolved.kind === 'text') {
        textKeyCodesRef.current.add(event.code);
        sendControl({ type: 'text', text: resolved.text });
        return;
      }
      heldKeysRef.current.set(event.code, {
        keyCode: resolved.keyCode,
        metaState: resolved.metaState,
      });
      sendControl(keyEvent(ANDROID_KEY_EVENT_ACTION.down, resolved.keyCode, resolved.metaState));
    },
    [sendControl],
  );

  const onKeyUp = useCallback(
    (event: KeyboardEvent<HTMLDivElement>): void => {
      if (textKeyCodesRef.current.delete(event.code)) {
        return;
      }
      const resolved = resolveKeyInput(toKeyInput(event));
      if (!resolved || resolved.kind !== 'keycode') {
        return;
      }
      heldKeysRef.current.delete(event.code);
      sendControl(keyEvent(ANDROID_KEY_EVENT_ACTION.up, resolved.keyCode, resolved.metaState));
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
