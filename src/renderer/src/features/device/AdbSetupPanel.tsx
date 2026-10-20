import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { useI18n } from '../../shared/i18n';
import { callApi } from '../../shared/manolo-api';

type AdbSetupPanelProps = {
  /** Called once adb is available, so the device list can load. */
  readonly onResolved: () => void;
  readonly onRetry: () => void;
  readonly retrying: boolean;
};

/** Shown instead of the device list when `adb` cannot be found. */
export function AdbSetupPanel({ onResolved, onRetry, retrying }: AdbSetupPanelProps): JSX.Element {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);

  const choose = async (): Promise<void> => {
    setError(null);
    const result = await callApi((api) => api.chooseAdb(), t('common.noBridge'));
    if (!result.ok) {
      setError(result.error);
    } else if (result.value.path !== null) {
      onResolved();
    }
  };

  const openDownload = async (): Promise<void> => {
    const result = await callApi((api) => api.openAdbDownload(), t('common.noBridge'));
    if (!result.ok) {
      setError(result.error);
    }
  };

  return (
    <section className="mx-auto flex min-h-[60vh] max-w-sm flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-lg font-semibold">{t('adb.missing')}</p>
      <p className="text-ink-2">{t('adb.missingBody')}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="primary" onClick={() => void openDownload()}>
          {t('adb.download')}
        </Button>
        <Button onClick={() => void choose()}>{t('adb.choose')}</Button>
        <Button onClick={onRetry} disabled={retrying}>
          {t('common.retry')}
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
