import { useCallback, useEffect, useState } from 'react';
import { getManoloApi } from '../../shared/manolo-api';
import type { CaptureAction } from '../../../../shared/preferences/types';
import { captureCanvasPng } from './capture-canvas';

export type CapturePreview = {
  readonly url: string;
  readonly buffer: ArrayBuffer;
};

export type UseCaptureResult = {
  readonly preview: CapturePreview | null;
  readonly busy: boolean;
  readonly open: () => Promise<void>;
  readonly copy: () => Promise<void>;
  readonly save: () => Promise<void>;
  readonly close: () => void;
};

/** Copies or saves a capture without showing the preview. */
async function deliver(
  action: Exclude<CaptureAction, 'preview'>,
  buffer: ArrayBuffer,
  showStatus: (message: string) => void,
): Promise<void> {
  const api = getManoloApi();
  if (!api) {
    return;
  }
  const result = await (action === 'copy' ? api.copyCapture(buffer) : api.saveCapture(buffer));
  if (!result.ok) {
    showStatus(result.error);
  } else if (action === 'copy') {
    showStatus('Copiado al portapapeles');
  } else {
    showStatus(result.value.saved ? 'Captura guardada' : 'Guardado cancelado');
  }
}

/** Captures the mirror canvas to a PNG and exposes copy/save actions via the main process. */
export function useCapture(
  canvas: HTMLCanvasElement | null,
  showStatus: (message: string) => void,
  /** What to do with a new capture: show the preview dialog, or copy or save it right away. */
  action: CaptureAction = 'preview',
): UseCaptureResult {
  const [preview, setPreview] = useState<CapturePreview | null>(null);
  const [busy, setBusy] = useState(false);

  const close = useCallback((): void => {
    setPreview((current) => {
      if (current) {
        URL.revokeObjectURL(current.url);
      }
      return null;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (preview) {
        URL.revokeObjectURL(preview.url);
      }
    };
  }, [preview]);

  const open = useCallback(async (): Promise<void> => {
    if (!canvas) {
      showStatus('Espejo no listo');
      return;
    }

    const buffer = await captureCanvasPng(canvas);
    if (!buffer) {
      showStatus('No se pudo capturar');
      return;
    }

    if (action !== 'preview') {
      await deliver(action, buffer, showStatus);
      return;
    }

    const url = URL.createObjectURL(new Blob([buffer], { type: 'image/png' }));
    setPreview((current) => {
      if (current) {
        URL.revokeObjectURL(current.url);
      }
      return { url, buffer };
    });
  }, [canvas, showStatus, action]);

  const copy = useCallback(async (): Promise<void> => {
    const api = getManoloApi();
    if (!preview || !api) {
      return;
    }
    setBusy(true);
    const result = await api.copyCapture(preview.buffer);
    setBusy(false);
    if (result.ok && result.value.copied) {
      showStatus('Copiado al portapapeles');
      close();
    } else if (!result.ok) {
      showStatus(result.error);
    }
  }, [preview, close, showStatus]);

  const save = useCallback(async (): Promise<void> => {
    const api = getManoloApi();
    if (!preview || !api) {
      return;
    }
    setBusy(true);
    const result = await api.saveCapture(preview.buffer);
    setBusy(false);
    if (result.ok && result.value.saved) {
      showStatus('Captura guardada');
      close();
    } else if (result.ok) {
      showStatus('Guardado cancelado');
    } else {
      showStatus(result.error);
    }
  }, [preview, close, showStatus]);

  return { preview, busy, open, copy, save, close };
}
