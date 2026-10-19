import QRCode from 'qrcode';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { getManoloApi } from '../../shared/manolo-api';

type QrPairingPanelProps = {
  /** Called once the phone is paired and connected, so the device list can refresh. */
  readonly onConnected: () => void;
};

type QrState =
  | { readonly step: 'idle' }
  | { readonly step: 'starting' }
  | { readonly step: 'waiting'; readonly sessionId: string; readonly qrUrl: string }
  | { readonly step: 'done'; readonly message: string }
  | { readonly step: 'error'; readonly message: string };

const NO_BRIDGE = 'Sin conexión con la app. Reiníciala.';

/** Pairs a phone by showing a QR code that it scans from "Depuración inalámbrica". */
export function QrPairingPanel({ onConnected }: QrPairingPanelProps): JSX.Element {
  const [state, setState] = useState<QrState>({ step: 'idle' });
  const activeSession = useRef<string | null>(null);

  const cancel = useCallback((): void => {
    const sessionId = activeSession.current;
    activeSession.current = null;
    if (sessionId) {
      void getManoloApi()?.cancelQrPairing(sessionId);
    }
  }, []);

  // Leaving the dialog must stop the search so the phone is not paired in the background.
  useEffect(() => cancel, [cancel]);

  const start = async (): Promise<void> => {
    const api = getManoloApi();
    if (!api) {
      setState({ step: 'error', message: NO_BRIDGE });
      return;
    }
    setState({ step: 'starting' });

    const started = await api.startQrPairing();
    if (!started.ok) {
      setState({ step: 'error', message: started.error });
      return;
    }
    const { sessionId, payload } = started.value;
    activeSession.current = sessionId;

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
      sessionId,
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
  };

  const stop = (): void => {
    cancel();
    setState({ step: 'idle' });
  };

  return (
    <section aria-label="Vincular con código QR" className="flex flex-col items-center gap-2">
      {state.step === 'waiting' ? (
        <>
          {/* Always dark on white: scanners need the contrast whatever the app theme is. */}
          <img
            src={state.qrUrl}
            alt="Código QR para vincular el teléfono"
            className="size-44 rounded-control bg-white p-1"
          />
          <ol className="list-decimal self-stretch pl-5 text-sm text-ink-2">
            <li>En el teléfono abre Opciones de desarrollador → Depuración inalámbrica.</li>
            <li>Toca «Vincular dispositivo con código QR» y escanea este código.</li>
          </ol>
          <p role="status" className="text-sm text-ink-2">
            Esperando al teléfono…
          </p>
          <Button onClick={stop}>Cancelar</Button>
        </>
      ) : (
        <>
          <p className="text-center text-ink-2">
            Vincula el teléfono escaneando un código QR. El teléfono y este equipo deben estar en la
            misma red Wi-Fi.
          </p>
          <Button
            variant="primary"
            onClick={() => void start()}
            disabled={state.step === 'starting'}
          >
            Mostrar código QR
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
