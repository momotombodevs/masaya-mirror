import QRCode from 'qrcode';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { useI18n } from '../../shared/i18n';
import { getManoloApi } from '../../shared/manolo-api';

type QrPairingPanelProps = {
  /** Called once the phone is paired and connected, so the device list can refresh. */
  readonly onConnected: () => void;
};

type QrState =
  | { readonly step: 'idle' }
  | { readonly step: 'starting' }
  | { readonly step: 'waiting'; readonly qrUrl: string }
  | { readonly step: 'done'; readonly message: string }
  | { readonly step: 'error'; readonly message: string };

/** Pairs a phone by showing a QR code that it scans from "Depuración inalámbrica". */
export function QrPairingPanel({ onConnected }: QrPairingPanelProps): JSX.Element {
  const { t } = useI18n();
  const [state, setState] = useState<QrState>({ step: 'idle' });
  const activeSession = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const cancel = useCallback((): void => {
    const sessionId = activeSession.current;
    activeSession.current = null;
    if (sessionId) {
      void getManoloApi()?.cancelQrPairing(sessionId);
    }
  }, []);

  // Leaving the dialog must stop the search so the phone is not paired in the background.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancel();
    };
  }, [cancel]);

  const start = async (): Promise<void> => {
    const api = getManoloApi();
    if (!api) {
      setState({ step: 'error', message: t('common.noBridge') });
      return;
    }
    setState({ step: 'starting' });

    try {
      const started = await api.startQrPairing();
      if (!started.ok) {
        setState({ step: 'error', message: started.error });
        return;
      }
      const { sessionId, payload } = started.value;
      activeSession.current = sessionId;
      if (!mountedRef.current) {
        cancel(); // the dialog closed while the session was starting
        return;
      }

      // SVG is generated without a canvas and shown as an image, so no markup is injected.
      const svg = await QRCode.toString(payload, {
        type: 'svg',
        margin: 1,
        errorCorrectionLevel: 'M',
      });
      if (activeSession.current !== sessionId) {
        return;
      }
      setState({
        step: 'waiting',
        qrUrl: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
      });

      const result = await api.waitQrPairing(sessionId);
      if (activeSession.current !== sessionId) {
        return; // cancelled or replaced while waiting
      }
      activeSession.current = null;
      if (result.ok) {
        setState({ step: 'done', message: result.value.message });
        onConnected();
      } else {
        setState({ step: 'error', message: result.error });
      }
    } catch (error: unknown) {
      cancel();
      if (mountedRef.current) {
        setState({
          step: 'error',
          message: error instanceof Error ? error.message : t('common.noBridge'),
        });
      }
    }
  };

  const stop = (): void => {
    cancel();
    setState({ step: 'idle' });
  };

  return (
    <section aria-label={t('qr.section')} className="flex flex-col items-center gap-2">
      {state.step === 'waiting' ? (
        <>
          {/* Always dark on white: scanners need the contrast whatever the app theme is. */}
          <img
            src={state.qrUrl}
            alt={t('qr.alt')}
            className="size-44 rounded-control bg-white p-1"
          />
          <ol className="list-decimal self-stretch pl-5 text-sm text-ink-2">
            <li>{t('qr.step1')}</li>
            <li>{t('qr.step2')}</li>
          </ol>
          <p role="status" className="text-sm text-ink-2">
            {t('qr.waiting')}
          </p>
          <Button onClick={stop}>{t('common.cancel')}</Button>
        </>
      ) : (
        <>
          <p className="text-center text-ink-2">{t('qr.intro')}</p>
          <Button
            variant="primary"
            onClick={() => void start()}
            disabled={state.step === 'starting'}
          >
            {t('qr.show')}
          </Button>
        </>
      )}

      {state.step === 'done' && (
        <p role="status" className="text-sm text-success">
          {state.message}
        </p>
      )}
      {state.step === 'error' && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}
    </section>
  );
}
