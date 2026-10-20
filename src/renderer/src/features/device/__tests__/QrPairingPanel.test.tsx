// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QrPairingPanel } from '../QrPairingPanel';

const startQrPairing = vi.fn();
const waitQrPairing = vi.fn();
const cancelQrPairing = vi.fn().mockResolvedValue({ ok: true, value: undefined });
const onConnected = vi.fn();

const PAYLOAD = 'WIFI:T:ADB;S:manolo-a1b2c3;P:Abcdefghjk23;;';

describe('QrPairingPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    startQrPairing.mockResolvedValue({ ok: true, value: { sessionId: 's1', payload: PAYLOAD } });
    vi.stubGlobal('manolo', { startQrPairing, waitQrPairing, cancelQrPairing });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const show = (): void => {
    render(<QrPairingPanel onConnected={onConnected} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar código QR' }));
  };

  it('draws the QR and waits for the phone', async () => {
    waitQrPairing.mockReturnValue(new Promise(() => undefined));
    show();

    const qr = await screen.findByRole('img', { name: 'Código QR para vincular el teléfono' });

    expect(qr.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    expect(screen.getByText('Esperando al teléfono…')).toBeTruthy();
    expect(waitQrPairing).toHaveBeenCalledWith('s1');
  });

  it('confirms and refreshes the list when the phone connects', async () => {
    waitQrPairing.mockResolvedValue({
      ok: true,
      value: { message: 'Conectado a 192.168.1.23:38711.' },
    });
    show();

    await waitFor(() => expect(onConnected).toHaveBeenCalledOnce());

    expect((await screen.findByRole('status')).textContent).toContain('Conectado a 192.168.1.23');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('shows why it could not start, e.g. mDNS unavailable', async () => {
    startQrPairing.mockResolvedValue({
      ok: false,
      error: 'Esta red no permite buscar el teléfono.',
    });
    show();

    expect((await screen.findByRole('alert')).textContent).toContain('no permite buscar');
    expect(waitQrPairing).not.toHaveBeenCalled();
  });

  it('shows the error when pairing fails and lets the user try again', async () => {
    waitQrPairing.mockResolvedValue({ ok: false, error: 'No se encontró el teléfono.' });
    show();

    expect((await screen.findByRole('alert')).textContent).toContain('No se encontró');
    expect(onConnected).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Mostrar código QR' })).toBeTruthy();
  });

  it('cancels the search from the Cancelar button', async () => {
    waitQrPairing.mockReturnValue(new Promise(() => undefined));
    show();
    await screen.findByRole('img');

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(cancelQrPairing).toHaveBeenCalledWith('s1');
    expect(screen.getByRole('button', { name: 'Mostrar código QR' })).toBeTruthy();
  });

  it('cancels the search when the dialog closes', async () => {
    waitQrPairing.mockReturnValue(new Promise(() => undefined));
    show();
    await screen.findByRole('img');

    cleanup();

    expect(cancelQrPairing).toHaveBeenCalledWith('s1');
  });

  it('cancels the session when the dialog closes while it is still starting', async () => {
    let finishStart: (value: unknown) => void = () => undefined;
    startQrPairing.mockReturnValue(new Promise((resolve) => (finishStart = resolve)));
    const { unmount } = render(<QrPairingPanel onConnected={onConnected} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar código QR' }));

    unmount();
    finishStart({ ok: true, value: { sessionId: 's1', payload: PAYLOAD } });

    await waitFor(() => expect(cancelQrPairing).toHaveBeenCalledWith('s1'));
    expect(waitQrPairing).not.toHaveBeenCalled();
  });

  it('shows an error instead of sticking when the start call throws', async () => {
    startQrPairing.mockRejectedValue(new Error('bridge down'));
    show();

    expect((await screen.findByRole('alert')).textContent).toContain('bridge down');
  });
});
