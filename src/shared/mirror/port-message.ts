export const MIRROR_PORT_WINDOW_MESSAGE = 'manolo-mirror-port' as const;

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
