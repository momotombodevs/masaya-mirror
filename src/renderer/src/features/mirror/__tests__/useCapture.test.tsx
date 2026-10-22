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
    vi.stubGlobal('masaya', { copyCapture, saveCapture });
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

    expect(showStatus).toHaveBeenCalledWith('Aún no hay imagen');
    expect(captureCanvasPng).not.toHaveBeenCalled();
  });

  it('revokes the preview URL once when it is closed, replaced or unmounted', async () => {
    URL.createObjectURL = vi.fn().mockReturnValueOnce('blob:one').mockReturnValueOnce('blob:two');
    const { result, unmount } = renderHook(() => useCapture(canvas, showStatus));

    await act(async () => result.current.open());
    await act(async () => result.current.open());
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenLastCalledWith('blob:one');

    act(() => result.current.close());
    expect(result.current.preview).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(URL.revokeObjectURL).toHaveBeenLastCalledWith('blob:two');

    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it('revokes the preview URL when the hook unmounts with a preview open', async () => {
    const { result, unmount } = renderHook(() => useCapture(canvas, showStatus));
    await act(async () => result.current.open());

    unmount();

    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });

  it('copies from the preview, closes it and is not busy afterwards', async () => {
    const { result } = renderHook(() => useCapture(canvas, showStatus));
    await act(async () => result.current.open());

    await act(async () => result.current.copy());

    expect(copyCapture).toHaveBeenCalledWith(PNG);
    expect(showStatus).toHaveBeenCalledWith('Copiado al portapapeles');
    expect(result.current.preview).toBeNull();
    expect(result.current.busy).toBe(false);
  });

  it('keeps the preview open when the save dialog is cancelled', async () => {
    saveCapture.mockResolvedValue({ ok: true, value: { saved: false } });
    const { result } = renderHook(() => useCapture(canvas, showStatus));
    await act(async () => result.current.open());

    await act(async () => result.current.save());

    expect(showStatus).toHaveBeenLastCalledWith('Guardado cancelado');
    expect(result.current.preview).not.toBeNull();
    expect(result.current.busy).toBe(false);
  });

  it('is not left busy when the bridge call rejects', async () => {
    saveCapture.mockRejectedValue(new Error('ipc closed'));
    const { result } = renderHook(() => useCapture(canvas, showStatus));
    await act(async () => result.current.open());

    await act(async () => result.current.save());

    expect(result.current.busy).toBe(false);
    expect(showStatus).toHaveBeenLastCalledWith('Sin conexión con la app. Reiníciala.');
  });
});
