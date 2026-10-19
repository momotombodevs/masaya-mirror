import { useCallback, useEffect, useRef, useState } from 'react';
import { getManoloApi } from '../../shared/manolo-api';

export type ApkInstall = {
  readonly installing: boolean;
  /** Installs the dropped file, or asks for one when `file` is omitted. */
  readonly install: (file?: File) => Promise<void>;
};

const isFileDrag = (event: DragEvent): boolean =>
  event.dataTransfer?.types.includes('Files') ?? false;

/**
 * Installs APKs on the mirrored device, from a file picker or by dropping a file anywhere
 * on the window. `report` shows the outcome in the toolbar.
 */
export function useApkInstall(deviceId: string, report: (message: string) => void): ApkInstall {
  const [installing, setInstalling] = useState(false);
  const installingRef = useRef(false);

  const install = useCallback(
    async (file?: File): Promise<void> => {
      const api = getManoloApi();
      if (!api || installingRef.current) {
        return;
      }
      installingRef.current = true;
      setInstalling(true);
      report('Instalando…');
      try {
        const result = await api.installApk(deviceId, file ? api.getPathForFile(file) : undefined);
        if (!result.ok) {
          report(result.error);
        } else if (result.value.installed) {
          report('APK instalado');
        } else {
          report('');
        }
      } finally {
        installingRef.current = false;
        setInstalling(false);
      }
    },
    [deviceId, report],
  );

  useEffect(() => {
    // Without preventDefault on dragover the browser would navigate to the dropped file.
    const onDragOver = (event: DragEvent): void => {
      if (isFileDrag(event)) {
        event.preventDefault();
      }
    };
    const onDrop = (event: DragEvent): void => {
      if (!isFileDrag(event)) {
        return;
      }
      event.preventDefault();
      const [file] = event.dataTransfer?.files ?? [];
      if (file) {
        void install(file);
      }
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [install]);

  return { installing, install };
}
