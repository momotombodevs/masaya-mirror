// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { callApi } from '../masaya-api';

describe('callApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns what the bridge answered', async () => {
    vi.stubGlobal('masaya', { listDevices: () => Promise.resolve({ ok: true, value: [] }) });

    const result = await callApi((api) => api.listDevices(), 'x');

    expect(result).toEqual({ ok: true, value: [] });
  });

  it('passes a failed Result through untouched', async () => {
    vi.stubGlobal('masaya', {
      listDevices: () => Promise.resolve({ ok: false, error: 'busy' }),
    });

    const result = await callApi((api) => api.listDevices(), 'x');

    expect(result).toEqual({ ok: false, error: 'busy' });
  });

  it('answers with the fallback message when there is no bridge', async () => {
    vi.stubGlobal('masaya', undefined);

    expect(await callApi(() => Promise.reject(new Error('unreachable')), 'no bridge')).toEqual({
      ok: false,
      error: 'no bridge',
    });
  });

  it('answers with the fallback message when the call rejects or throws', async () => {
    vi.stubGlobal('masaya', {});

    expect(await callApi(() => Promise.reject(new Error('ipc closed')), 'failed')).toEqual({
      ok: false,
      error: 'failed',
    });
    expect(
      await callApi(() => {
        throw new Error('sync');
      }, 'failed'),
    ).toEqual({ ok: false, error: 'failed' });
  });
});
