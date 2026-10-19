// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdbSetupPanel } from '../AdbSetupPanel';

const chooseAdb = vi.fn();
const openAdbDownload = vi.fn().mockResolvedValue({ ok: true, value: undefined });
const onResolved = vi.fn();
const onRetry = vi.fn();

describe('AdbSetupPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('manolo', { chooseAdb, openAdbDownload });
    render(<AdbSetupPanel onResolved={onResolved} onRetry={onRetry} retrying={false} />);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('opens the download page', () => {
    fireEvent.click(screen.getByRole('button', { name: 'Descargar platform-tools' }));

    expect(openAdbDownload).toHaveBeenCalledOnce();
  });

  it('resolves once an adb is chosen', async () => {
    chooseAdb.mockResolvedValue({ ok: true, value: { path: '/opt/platform-tools/adb' } });

    fireEvent.click(screen.getByRole('button', { name: 'Elegir adb…' }));

    await waitFor(() => expect(onResolved).toHaveBeenCalledOnce());
  });

  it('does nothing when the picker is cancelled', async () => {
    chooseAdb.mockResolvedValue({ ok: true, value: { path: null } });

    fireEvent.click(screen.getByRole('button', { name: 'Elegir adb…' }));

    await waitFor(() => expect(chooseAdb).toHaveBeenCalled());
    expect(onResolved).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('explains when the chosen file is not adb', async () => {
    chooseAdb.mockResolvedValue({ ok: false, error: 'El archivo elegido no es adb.' });

    fireEvent.click(screen.getByRole('button', { name: 'Elegir adb…' }));

    expect((await screen.findByRole('alert')).textContent).toContain('no es adb');
    expect(onResolved).not.toHaveBeenCalled();
  });

  it('retries the lookup', () => {
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(onRetry).toHaveBeenCalledOnce();
  });
});
