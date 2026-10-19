// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WifiConnectDialog } from '../WifiConnectDialog';

const onClose = vi.fn();

describe('WifiConnectDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('manolo', {});
    render(<WifiConnectDialog onClose={onClose} onConnected={vi.fn()} />);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('offers only the QR pairing, with no manual fields', () => {
    expect(screen.getByRole('button', { name: 'Mostrar código QR' })).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByText('Otras formas de conectar')).toBeNull();
  });

  it('closes with Escape and with Cerrar', () => {
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));

    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
