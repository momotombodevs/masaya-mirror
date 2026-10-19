import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { getManoloApi } from '../../shared/manolo-api';

type AdbSetupPanelProps = {
  /** Called once adb is available, so the device list can load. */
  readonly onResolved: () => void;
  readonly onRetry: () => void;
  readonly retrying: boolean;
};

/** Shown instead of the device list when `adb` cannot be found. */
export function AdbSetupPanel({ onResolved, onRetry, retrying }: AdbSetupPanelProps): JSX.Element {
  const [error, setError] = useState<string | null>(null);

  const choose = async (): Promise<void> => {
    setError(null);
    const result = await getManoloApi()?.chooseAdb();
    if (!result) {
      setError('Sin conexión con la app. Reiníciala.');
    } else if (!result.ok) {
      setError(result.error);
    } else if (result.value.path !== null) {
      onResolved();
    }
  };

  return (
    <section className="mx-auto flex min-h-[60vh] max-w-sm flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-lg font-semibold">Falta adb</p>
      <p className="text-ink-2">
        Manolo Mirror usa adb (Android platform-tools) para hablar con el teléfono. Descárgalo e
        instálalo, o elige el que ya tienes.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="primary" onClick={() => void getManoloApi()?.openAdbDownload()}>
          Descargar platform-tools
        </Button>
        <Button onClick={() => void choose()}>Elegir adb…</Button>
        <Button onClick={onRetry} disabled={retrying}>
          Reintentar
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
