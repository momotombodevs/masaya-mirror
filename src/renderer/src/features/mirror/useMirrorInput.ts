import {
  useCallback,
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
import { mapBrowserKeyToAndroid } from './android-keycodes';

export type VideoSize = { width: number; height: number };

export type MirrorInputHandlers = {
  readonly onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => void;
  readonly onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => void;
  readonly onPointerUp: (event: PointerEvent<HTMLCanvasElement>) => void;
  readonly onWheel: (event: WheelEvent<HTMLCanvasElement>) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  readonly onKeyUp: (event: KeyboardEvent<HTMLDivElement>) => void;
};

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

  const injectTouch = useCallback(
    (action: number, clientX: number, clientY: number, pressure: number): void => {
      const coords = mapPointerToDevice(clientX, clientY);
      const { width, height } = videoSizeRef.current;
      if (!coords) {
        return;
      }
      sendControl({
        type: 'touch',
        action,
        pointerId: 0,
        pointerX: coords.x,
        pointerY: coords.y,
        videoWidth: width,
        videoHeight: height,
        pressure,
        buttons: 0,
        actionButton: 0,
      });
    },
    [mapPointerToDevice, sendControl, videoSizeRef],
  );

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLCanvasElement>): void => {
      event.currentTarget.setPointerCapture(event.pointerId);
      injectTouch(ANDROID_MOTION_EVENT_ACTION.down, event.clientX, event.clientY, 1);
    },
    [injectTouch],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLCanvasElement>): void => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
        return;
      }
      injectTouch(ANDROID_MOTION_EVENT_ACTION.move, event.clientX, event.clientY, 1);
    },
    [injectTouch],
  );

  const onPointerUp = useCallback(
    (event: PointerEvent<HTMLCanvasElement>): void => {
      injectTouch(ANDROID_MOTION_EVENT_ACTION.up, event.clientX, event.clientY, 0);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [injectTouch],
  );

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

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>): void => {
      if (event.key === 'Escape') {
        return;
      }
      const keyCode = mapBrowserKeyToAndroid(event.code);
      if (keyCode === null) {
        return;
      }
      event.preventDefault();
      sendControl({
        type: 'key',
        action: ANDROID_KEY_EVENT_ACTION.down,
        keyCode,
        repeat: 0,
        metaState: 0,
      });
    },
    [sendControl],
  );

  const onKeyUp = useCallback(
    (event: KeyboardEvent<HTMLDivElement>): void => {
      const keyCode = mapBrowserKeyToAndroid(event.code);
      if (keyCode === null) {
        return;
      }
      sendControl({
        type: 'key',
        action: ANDROID_KEY_EVENT_ACTION.up,
        keyCode,
        repeat: 0,
        metaState: 0,
      });
    },
    [sendControl],
  );

  return { onPointerDown, onPointerMove, onPointerUp, onWheel, onKeyDown, onKeyUp };
}
