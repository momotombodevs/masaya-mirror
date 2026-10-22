import {
  ANDROID_KEY_EVENT_ACTION,
  type MirrorControlMessage,
} from '../../../../shared/mirror/types';

/** The key event for one half of a press. */
export function keyEvent(
  action: number,
  keyCode: number,
  metaState = 0,
): Extract<MirrorControlMessage, { type: 'key' }> {
  return { type: 'key', action, keyCode, repeat: 0, metaState };
}

/** A full press of an Android key: key down, then key up. */
export function keyPressMessages(keyCode: number): readonly MirrorControlMessage[] {
  return [
    keyEvent(ANDROID_KEY_EVENT_ACTION.down, keyCode),
    keyEvent(ANDROID_KEY_EVENT_ACTION.up, keyCode),
  ];
}
