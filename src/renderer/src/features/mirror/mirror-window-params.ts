export type MirrorWindowParams = {
  readonly deviceId: string;
  readonly deviceLabel: string;
};

/** Reads the mirror window target device from the current window URL. */
export function parseMirrorWindowParams(): MirrorWindowParams | null {
  const params = new URLSearchParams(window.location.search);
  const deviceId = params.get('deviceId');
  if (!deviceId) {
    return null;
  }
  const label = params.get('label')?.trim();
  return { deviceId, deviceLabel: label && label.length > 0 ? label : deviceId };
}
