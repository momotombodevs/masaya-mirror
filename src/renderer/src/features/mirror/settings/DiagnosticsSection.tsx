import { useEffect, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { useI18n } from '../../../shared/i18n';
import { callApi } from '../../../shared/masaya-api';
import { ROW_ICONS } from './row-icons';
import { SettingRow, SettingsSection } from './settings-layout';

/** How long the copy button reads "Copied" before it can be pressed again. */
const COPIED_FEEDBACK_MS = 2_000;

/** Lets someone reporting a bug attach versions, phones and the recent log in one paste. */
export function DiagnosticsSection(): JSX.Element {
  const { t } = useI18n();
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = window.setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = async (): Promise<void> => {
    setCopying(true);
    const result = await callApi(
      (api) => api.copyDiagnosticReport(),
      t('settings.diagnostics.copyFailed'),
    );
    setCopying(false);
    setCopied(result.ok);
    setError(result.ok ? null : result.error);
  };

  const openLogs = async (): Promise<void> => {
    const result = await callApi(
      (api) => api.openLogFolder(),
      t('settings.diagnostics.openLogsFailed'),
    );
    setError(result.ok ? null : result.error);
  };

  return (
    <SettingsSection title={t('settings.section.support')}>
      <SettingRow
        label={t('settings.diagnostics.copy')}
        hint={t('settings.diagnostics.copyHint')}
        icon={ROW_ICONS.report}
        tone="green"
      >
        <Button
          aria-label={copied ? t('settings.diagnostics.copied') : t('settings.diagnostics.copy')}
          disabled={copying || copied}
          onClick={() => void copy()}
        >
          {copied ? t('settings.diagnostics.copied') : t('settings.diagnostics.copyAction')}
        </Button>
      </SettingRow>
      <SettingRow label={t('settings.diagnostics.openLogs')} icon={ROW_ICONS.folder} tone="blue">
        <Button aria-label={t('settings.diagnostics.openLogs')} onClick={() => void openLogs()}>
          {t('settings.diagnostics.openLogsAction')}
        </Button>
      </SettingRow>
      {error && (
        <p role="alert" className="px-4 py-2.5 text-sm text-danger">
          {error}
        </p>
      )}
    </SettingsSection>
  );
}
