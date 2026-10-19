// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WifiConnectDialog } from '../WifiConnectDialog';

const connectWifi = vi.fn();
const pairWifi = vi.fn();
const onConnected = vi.fn();
const onClose = vi.fn();

const type = (label: string, value: string): void => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
};

describe('WifiConnectDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('manolo', { connectWifi, pairWifi });
    render(<WifiConnectDialog onClose={onClose} onConnected={onConnected} />);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('keeps Conectar disabled until there is an address', () => {
    const button = screen.getByRole('button', { name: 'Conectar' });
    expect((button as HTMLButtonElement).disabled).toBe(true);

    type('Dirección IP y puerto', '192.168.1.20:5555');

    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  it('connects, confirms, and tells the list to refresh', async () => {
    connectWifi.mockResolvedValue({
      ok: true,
      value: { message: 'Conectado a 192.168.1.20:5555.' },
    });
    type('Dirección IP y puerto', '192.168.1.20:5555');

    fireEvent.click(screen.getByRole('button', { name: 'Conectar' }));

    expect((await screen.findByRole('status')).textContent).toContain(
      'Conectado a 192.168.1.20:5555.',
    );
    expect(connectWifi).toHaveBeenCalledWith('192.168.1.20:5555');
    expect(onConnected).toHaveBeenCalledOnce();
  });

  it('shows the error and does not refresh when the connection fails', async () => {
    connectWifi.mockResolvedValue({ ok: false, error: 'failed to connect to 192.168.1.20:5555' });
    type('Dirección IP y puerto', '192.168.1.20:5555');

    fireEvent.click(screen.getByRole('button', { name: 'Conectar' }));

    expect((await screen.findByRole('alert')).textContent).toContain('failed to connect');
    expect(onConnected).not.toHaveBeenCalled();
  });

  it('pairs only with a full 6-digit code, then points to the connect step', async () => {
    pairWifi.mockResolvedValue({ ok: true, value: { message: 'Dispositivo vinculado.' } });
    type('Dirección de vinculación', '192.168.1.20:37099');
    const pair = screen.getByRole('button', { name: 'Vincular' });

    type('Código de 6 dígitos', '12345');
    expect((pair as HTMLButtonElement).disabled).toBe(true);
    type('Código de 6 dígitos', '123456');
    expect((pair as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(pair);

    await waitFor(() => expect(pairWifi).toHaveBeenCalledWith('192.168.1.20:37099', '123456'));
    expect((await screen.findByRole('status')).textContent).toContain(
      'Dispositivo vinculado. Ahora conecta',
    );
    expect(onConnected).not.toHaveBeenCalled();
  });

  it('closes with Escape', () => {
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledOnce();
  });
});
