import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../../shared/i18n';
import { callApi } from '../../shared/manolo-api';
import type { CaptureAction } from '../../../../shared/preferences/types';
import { captureCanvasPng } from './capture-canvas';

type CapturePreview = {
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

/** Captures the mirror canvas to a PNG and exposes copy/save actions via the main process. */
export function useCapture(
  canvas: HTMLCanvasElement | null,
  showStatus: (message: string) => void,
  /** What to do with a new capture: show the preview dialog, or copy or save it right away. */
  action: CaptureAction = 'preview',
): UseCaptureResult {
  const { t } = useI18n();
  const [preview, setPreview] = useState<CapturePreview | null>(null);
  const [busy, setBusy] = useState(false);

  // The preview URL is revoked here and only here: when it is replaced, closed or the hook unmounts.
  useEffect(() => {
    if (!preview) {
      return undefined;
    }
    return () => URL.revokeObjectURL(preview.url);
  }, [preview]);

  const close = useCallback((): void => setPreview(null), []);

  /** Copies or saves a capture. Resolves true when it was done, so the preview can close. */
  const deliver = useCallback(
    async (kind: 'copy' | 'save', buffer: ArrayBuffer): Promise<boolean> => {
      const result = await callApi(
        (api) => (kind === 'copy' ? api.copyCapture(buffer) : api.saveCapture(buffer)),
        t('common.noBridge'),
      );
      if (!result.ok) {
        showStatus(result.error);
        return false;
      }
      if (kind === 'copy') {
        if (result.value.copied) {
          showStatus(t('status.copied'));
        }
        return result.value.copied === true;
      }
      if (result.value.saved) {
        showStatus(t('status.captureSaved'));
      } else {
        showStatus(t('status.saveCancelled'));
      }
      return result.value.saved === true;
    },
    [showStatus, t],
  );

  const open = useCallback(async (): Promise<void> => {
    if (!canvas) {
      showStatus(t('status.notReady'));
      return;
    }

    const buffer = await captureCanvasPng(canvas);
    if (!buffer) {
      showStatus(t('status.captureFailed'));
      return;
    }

    if (action !== 'preview') {
      await deliver(action, buffer);
      return;
    }

    const url = URL.createObjectURL(new Blob([buffer], { type: 'image/png' }));
    setPreview({ url, buffer });
  }, [canvas, showStatus, action, deliver, t]);

  const deliverPreview = useCallback(
    async (kind: 'copy' | 'save'): Promise<void> => {
      if (!preview) {
        return;
      }
      setBusy(true);
      try {
        if (await deliver(kind, preview.buffer)) {
          close();
        }
      } finally {
        setBusy(false);
      }
    },
    [preview, deliver, close],
  );

  const copy = useCallback(() => deliverPreview('copy'), [deliverPreview]);
  const save = useCallback(() => deliverPreview('save'), [deliverPreview]);

  return { preview, busy, open, copy, save, close };
}
