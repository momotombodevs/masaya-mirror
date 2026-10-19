import { useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { TextField } from '../../components/ui/TextField';
import { getManoloApi } from '../../shared/manolo-api';
import { QrPairingPanel } from './QrPairingPanel';

type WifiConnectDialogProps = {
  readonly onClose: () => void;
  /** Called after a successful connect so the device list can refresh. */
  readonly onConnected: () => void;
};

type Feedback = { readonly tone: 'success' | 'error'; readonly text: string };

/** Connects a phone over Wi-Fi, with the one-time pairing step for Android 11+ underneath. */
export function WifiConnectDialog({ onClose, onConnected }: WifiConnectDialogProps): JSX.Element {
  const [address, setAddress] = useState('');
  const [pairAddress, setPairAddress] = useState('');
  const [pairCode, setPairCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const run = async (action: () => Promise<Feedback & { readonly ok: boolean }>): Promise<void> => {
    setBusy(true);
    setFeedback(null);
    const outcome = await action();
    setBusy(false);
    setFeedback({ tone: outcome.tone, text: outcome.text });
    if (outcome.ok) {
      onConnected();
    }
  };

  const connect = (event: FormEvent): void => {
    event.preventDefault();
    void run(async () => {
      const result = await getManoloApi()?.connectWifi(address);
      if (!result) {
        return { ok: false, tone: 'error', text: 'Sin conexión con la app. Reiníciala.' };
      }
      return result.ok
        ? { ok: true, tone: 'success', text: result.value.message }
        : { ok: false, tone: 'error', text: result.error };
    });
  };

  const pair = (event: FormEvent): void => {
    event.preventDefault();
    void run(async () => {
      const result = await getManoloApi()?.pairWifi(pairAddress, pairCode);
      if (!result) {
        return { ok: false, tone: 'error', text: 'Sin conexión con la app. Reiníciala.' };
      }
      // Pairing does not connect: the phone still needs its own address in the form above.
      return result.ok
        ? {
            ok: false,
            tone: 'success',
            text: `${result.value.message} Ahora conecta con la dirección de la pantalla principal de «Depuración inalámbrica».`,
          }
        : { ok: false, tone: 'error', text: result.error };
    });
  };

  return (
    <Dialog
      title="Conectar por Wi-Fi"
      onClose={onClose}
      footer={<Button onClick={onClose}>Cerrar</Button>}
    >
      <QrPairingPanel onConnected={onConnected} />

      <details className="mt-4 border-t border-line pt-3">
        <summary className="cursor-default text-ink-2">Otras formas de conectar</summary>
        <div className="mt-3">
          <form className="flex flex-col gap-2" onSubmit={connect}>
            <TextField
              label="Dirección IP y puerto"
              placeholder="192.168.1.20:5555"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
            />
            <Button
              type="submit"
              variant="primary"
              className="self-end"
              disabled={busy || !address.trim()}
            >
              Conectar
            </Button>
          </form>

          <details className="mt-3 border-t border-line pt-3">
            <summary className="cursor-default text-ink-2">Vincular con código (sin QR)</summary>
            <p className="mt-2 text-sm text-ink-2">
              En el teléfono: Opciones de desarrollador → Depuración inalámbrica → Vincular
              dispositivo con código. Copia aquí la dirección y el código que muestra.
            </p>
            <form className="mt-2 flex flex-col gap-2" onSubmit={pair}>
              <TextField
                label="Dirección de vinculación"
                placeholder="192.168.1.20:37099"
                value={pairAddress}
                onChange={(event) => setPairAddress(event.target.value)}
              />
              <TextField
                label="Código de 6 dígitos"
                placeholder="123456"
                inputMode="numeric"
                maxLength={6}
                value={pairCode}
                onChange={(event) => setPairCode(event.target.value)}
              />
              <Button
                type="submit"
                className="self-end"
                disabled={busy || !pairAddress.trim() || pairCode.trim().length !== 6}
              >
                Vincular
              </Button>
            </form>
          </details>
        </div>
      </details>

      {feedback && (
        <p
          role={feedback.tone === 'error' ? 'alert' : 'status'}
          className={`mt-3 text-sm ${feedback.tone === 'error' ? 'text-danger' : 'text-success'}`}
        >
          {feedback.text}
        </p>
      )}
    </Dialog>
  );
}
