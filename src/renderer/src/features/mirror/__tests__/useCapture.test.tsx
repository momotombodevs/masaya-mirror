// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCapture } from '../useCapture';

const captureCanvasPng = vi.hoisted(() => vi.fn());
vi.mock('../capture-canvas', () => ({ captureCanvasPng }));

const copyCapture = vi.fn();
const saveCapture = vi.fn();
const showStatus = vi.fn();
const canvas = document.createElement('canvas');
const PNG = new ArrayBuffer(8);

describe('useCapture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureCanvasPng.mockResolvedValue(PNG);
    copyCapture.mockResolvedValue({ ok: true, value: { copied: true } });
    saveCapture.mockResolvedValue({ ok: true, value: { saved: true } });
    vi.stubGlobal('manolo', { copyCapture, saveCapture });
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows the preview by default and sends nothing yet', async () => {
    const { result } = renderHook(() => useCapture(canvas, showStatus));

    await act(async () => result.current.open());

    expect(result.current.preview?.url).toBe('blob:preview');
    expect(copyCapture).not.toHaveBeenCalled();
    expect(saveCapture).not.toHaveBeenCalled();
  });

  it('copies straight away when the capture action is copy', async () => {
    const { result } = renderHook(() => useCapture(canvas, showStatus, 'copy'));

    await act(async () => result.current.open());

    expect(copyCapture).toHaveBeenCalledWith(PNG);
    expect(result.current.preview).toBeNull();
    expect(showStatus).toHaveBeenCalledWith('Copiado al portapapeles');
  });

  it('saves straight away when the capture action is save, and reports a cancelled dialog', async () => {
    const { result } = renderHook(() => useCapture(canvas, showStatus, 'save'));

    await act(async () => result.current.open());
    expect(saveCapture).toHaveBeenCalledWith(PNG);
    expect(showStatus).toHaveBeenLastCalledWith('Captura guardada');

    saveCapture.mockResolvedValue({ ok: true, value: { saved: false } });
    await act(async () => result.current.open());
    expect(showStatus).toHaveBeenLastCalledWith('Guardado cancelado');
  });

  it('shows the error when copying or saving fails', async () => {
    copyCapture.mockResolvedValue({ ok: false, error: 'No se pudo copiar' });
    const { result } = renderHook(() => useCapture(canvas, showStatus, 'copy'));

    await act(async () => result.current.open());

    expect(showStatus).toHaveBeenCalledWith('No se pudo copiar');
  });

  it('does nothing without a canvas', async () => {
    const { result } = renderHook(() => useCapture(null, showStatus, 'copy'));

    await act(async () => result.current.open());

    expect(showStatus).toHaveBeenCalledWith('Espejo no listo');
    expect(captureCanvasPng).not.toHaveBeenCalled();
  });
});
