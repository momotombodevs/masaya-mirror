import { useCallback, useEffect, useRef, useState } from 'react';
import type { RecordingFormat } from '../../../../shared/preferences/types';
import { useI18n } from '../../shared/i18n';
import { getManoloApi } from '../../shared/manolo-api';
import { encodeGif } from './gif-encoder';
import { createCanvasFrameGrabber, GifRecorder } from './gif-recorder';
import { GIF_MIME_TYPE, pickVideoMimeType } from './recording-formats';

const RECORDING_FPS = 30;
const RECORDING_CHUNK_MS = 1000;
// MediaRecorder defaults to about 2.5 Mbps, far below the 8-32 Mbps stream it re-encodes.
const RECORDING_BIT_RATE = 16_000_000;
// Chunks stay in memory until the recording stops (about 8 minutes at the bit rate above).
const MAX_RECORDING_BYTES = 128 * 1024 * 1024;

export type UseRecordingResult = {
  readonly recording: boolean;
  readonly toggle: () => Promise<void>;
};

function stopStreamTracks(streamRef: { current: MediaStream | null }): void {
  streamRef.current?.getTracks().forEach((track) => track.stop());
  streamRef.current = null;
}

/** Records the mirror canvas as MP4 video or an animated GIF and saves it via the main process. */
export function useRecording(
  canvas: HTMLCanvasElement | null,
  showStatus: (message: string) => void,
  format: RecordingFormat = 'video',
): UseRecordingResult {
  const { t } = useI18n();
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const gifRecorderRef = useRef<GifRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const save = useCallback(
    async (data: ArrayBuffer, mimeType: string, savedMessage: string): Promise<void> => {
      const api = getManoloApi();
      if (!api) {
        return;
      }
      try {
        const result = await api.saveRecording(data, mimeType);
        if (result.ok && result.value.saved) {
          showStatus(savedMessage);
        } else if (!result.ok) {
          showStatus(result.error);
        }
      } catch {
        showStatus(t('status.recordingFailed'));
      }
    },
    [showStatus, t],
  );

  const finishGif = useCallback(async (): Promise<void> => {
    const recorder = gifRecorderRef.current;
    gifRecorderRef.current = null;
    setRecording(false);
    if (!recorder) {
      return;
    }
    const frames = recorder.stop();
    if (frames.length === 0) {
      return;
    }
    showStatus(t('status.makingGif'));
    try {
      const bytes = await encodeGif(frames);
      await save(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
        GIF_MIME_TYPE,
        t('status.gifSaved'),
      );
    } catch {
      showStatus(t('status.recordingFailed'));
    }
  }, [save, showStatus, t]);

  const startGif = useCallback(
    (source: HTMLCanvasElement): void => {
      const recorder = new GifRecorder(createCanvasFrameGrabber(source), () => void finishGif());
      gifRecorderRef.current = recorder;
      recorder.start();
    },
    [finishGif],
  );

  const startVideo = useCallback(
    (source: HTMLCanvasElement): boolean => {
      const mimeType = pickVideoMimeType();
      if (!mimeType) {
        showStatus(t('status.recordingUnsupported'));
        return false;
      }
      const stream = source.captureStream(RECORDING_FPS);
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: RECORDING_BIT_RATE,
      });
      streamRef.current = stream;
      chunksRef.current = [];
      let recordedBytes = 0;

      recorder.ondataavailable = (event) => {
        if (event.data.size === 0) {
          return;
        }
        chunksRef.current.push(event.data);
        recordedBytes += event.data.size;
        if (recordedBytes >= MAX_RECORDING_BYTES && recorder.state === 'recording') {
          showStatus(t('status.recordingLimit'));
          recorder.stop();
        }
      };

      recorder.onstop = async () => {
        setRecording(false);
        recorderRef.current = null;
        stopStreamTracks(streamRef);
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        try {
          await save(await blob.arrayBuffer(), mimeType, t('status.videoSaved'));
        } catch {
          showStatus(t('status.recordingFailed'));
        }
      };

      recorder.start(RECORDING_CHUNK_MS);
      recorderRef.current = recorder;
      return true;
    },
    [save, showStatus, t],
  );

  const toggle = useCallback(async (): Promise<void> => {
    if (!canvas) {
      showStatus(t('status.notReady'));
      return;
    }

    if (recording) {
      if (gifRecorderRef.current) {
        await finishGif();
      } else {
        recorderRef.current?.stop();
      }
      return;
    }

    if (format === 'gif') {
      startGif(canvas);
    } else if (!startVideo(canvas)) {
      return;
    }
    setRecording(true);
    showStatus(t('status.recording'));
  }, [canvas, finishGif, format, recording, showStatus, startGif, startVideo, t]);

  // Closing the window mid-recording must not leave a timer or a live capture running.
  useEffect(() => {
    return () => {
      gifRecorderRef.current?.stop();
      gifRecorderRef.current = null;
      const recorder = recorderRef.current;
      recorderRef.current = null;
      if (recorder) {
        recorder.onstop = null;
        recorder.ondataavailable = null;
        if (recorder.state !== 'inactive') {
          recorder.stop();
        }
      }
      chunksRef.current = [];
      stopStreamTracks(streamRef);
    };
  }, []);

  return { recording, toggle };
}
