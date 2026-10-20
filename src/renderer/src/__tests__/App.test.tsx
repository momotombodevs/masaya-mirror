// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';

const listDevices = vi.fn();
const getMirrorStatus = vi.fn();

describe('App', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    listDevices.mockReset().mockResolvedValue({
      ok: true,
      value: [{ id: 'a', status: 'device', model: 'Pixel' }],
    });
    getMirrorStatus.mockReset().mockResolvedValue({ ok: true, value: { activeDeviceIds: [] } });
    vi.stubGlobal('manolo', { listDevices, getMirrorStatus, onMenuAction: () => () => undefined });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shows a device mirrored from another window after the next refresh', async () => {
    render(<App />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.queryByText('En espejo')).toBeNull();

    getMirrorStatus.mockResolvedValue({ ok: true, value: { activeDeviceIds: ['a'] } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(screen.getByText('En espejo')).toBeTruthy();
  });

  it('re-reads the mirroring state when the window regains focus', async () => {
    render(<App />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    getMirrorStatus.mockClear();

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(getMirrorStatus).toHaveBeenCalledOnce();
  });

  it('offers the adb setup when the failure carries the ADB_NOT_FOUND code', async () => {
    listDevices.mockResolvedValue({ ok: false, error: 'any wording', code: 'ADB_NOT_FOUND' });
    render(<App />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByText('Falta adb')).toBeTruthy();
  });
});
