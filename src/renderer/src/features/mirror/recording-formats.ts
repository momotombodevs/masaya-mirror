/** Candidates for the video recording, best first: MP4 plays everywhere, WebM only as a fallback. */
const VIDEO_MIME_TYPES = [
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm',
] as const;

/** The first video type the browser can record, or null when none can. */
export function pickVideoMimeType(
  isSupported: (mimeType: string) => boolean = (mimeType) =>
    MediaRecorder.isTypeSupported(mimeType),
): string | null {
  return VIDEO_MIME_TYPES.find((mimeType) => isSupported(mimeType)) ?? null;
}

export const GIF_MIME_TYPE = 'image/gif';
