import { useCallback, useRef, useState } from 'react';
import { useI18n } from '../../shared/i18n';
import { getManoloApi } from '../../shared/manolo-api';

const RECORDING_FPS = 30;
const RECORDING_CHUNK_MS = 1000;
// MediaRecorder defaults to about 2.5 Mbps, far below the 8-32 Mbps stream it re-encodes.
const RECORDING_BIT_RATE = 16_000_000;

export type UseRecordingResult = {
  readonly recording: boolean;
  readonly toggle: () => Promise<void>;
};

function pickMimeType(): string {
  return MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';
}

/** Records the mirror canvas with MediaRecorder and saves it via the main process. */
export function useRecording(
  canvas: HTMLCanvasElement | null,
  showStatus: (message: string) => void,
): UseRecordingResult {
  const { t } = useI18n();
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const toggle = useCallback(async (): Promise<void> => {
    if (!canvas) {
      showStatus(t('status.notReady'));
      return;
    }

    if (recording && recorderRef.current) {
      recorderRef.current.stop();
      return;
    }

    const stream = canvas.captureStream(RECORDING_FPS);
    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: RECORDING_BIT_RATE,
    });
    chunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onstop = async () => {
      setRecording(false);
      recorderRef.current = null;
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const buffer = await blob.arrayBuffer();
      const api = getManoloApi();
      if (!api) {
        return;
      }
      const result = await api.saveRecording(buffer, mimeType);
      if (result.ok && result.value.saved) {
        showStatus(t('status.videoSaved'));
      } else if (!result.ok) {
        showStatus(result.error);
      }
    };

    recorder.start(RECORDING_CHUNK_MS);
    recorderRef.current = recorder;
    setRecording(true);
    showStatus(t('status.recording'));
  }, [canvas, recording, showStatus, t]);

  return { recording, toggle };
}
