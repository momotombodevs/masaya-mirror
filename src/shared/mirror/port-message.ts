export const MIRROR_PORT_WINDOW_MESSAGE = 'masaya-mirror-port' as const;

export type MirrorPortWindowMessage = {
  readonly type: typeof MIRROR_PORT_WINDOW_MESSAGE;
  readonly deviceId: string;
};

export function isMirrorPortWindowMessage(data: unknown): data is MirrorPortWindowMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    (data as MirrorPortWindowMessage).type === MIRROR_PORT_WINDOW_MESSAGE &&
    typeof (data as MirrorPortWindowMessage).deviceId === 'string'
  );
}

type MessagePortLike = {
  readonly addEventListener: unknown;
  readonly start: unknown;
};

/** Structural check that a value is usable as a MessagePort (renderer or preload). */
export function isValidMessagePort(port: unknown): port is MessagePort {
  return (
    port !== null &&
    typeof port === 'object' &&
    typeof (port as MessagePortLike).addEventListener === 'function' &&
    typeof (port as MessagePortLike).start === 'function'
  );
}
