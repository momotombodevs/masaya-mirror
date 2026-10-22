import { useI18n } from '../shared/i18n';
import { Button } from './ui/Button';

export function ErrorFallback({ error }: { readonly error: Error }): JSX.Element {
  const { t } = useI18n();
  return (
    <div className="p-6">
      <h1 className="mb-2 text-xl font-semibold">Masaya</h1>
      <p role="alert" className="mb-4 text-danger">
        {t('errorBoundary.loadError', { message: error.message })}
      </p>
      <Button onClick={() => window.location.reload()}>{t('common.reload')}</Button>
    </div>
  );
}
