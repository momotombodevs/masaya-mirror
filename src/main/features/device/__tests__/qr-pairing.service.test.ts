import { beforeEach, describe, expect, it, vi } from 'vitest';
import { err, ok } from '../../../../shared/ipc/result';
import type { MdnsService } from '../adb.service';
import { QrPairingService } from '../qr-pairing.service';

const adb = {
  checkMdns: vi.fn(),
  listMdnsServices: vi.fn(),
  pair: vi.fn(),
  connect: vi.fn(),
};

const make = (): QrPairingService =>
  new QrPairingService(adb, {
    pollIntervalMs: 10,
    searchTimeoutMs: 50,
    connectTimeoutMs: 30,
    sleep: async () => undefined,
  });

/** Pulls the service name and password back out of the QR text. */
function parsePayload(payload: string): { name: string; password: string } {
  const match = /^WIFI:T:ADB;S:([^;]+);P:([^;]+);;$/.exec(payload);
  if (!match?.[1] || !match[2]) {
    throw new Error(`Unexpected QR payload: ${payload}`);
  }
  return { name: match[1], password: match[2] };
}

const pairingService = (name: string): MdnsService => ({
  name,
  kind: 'pairing',
  address: '192.168.1.23:41921',
});
const connectService: MdnsService = {
  name: 'adb-R5CT',
  kind: 'connect',
  address: '192.168.1.23:38711',
};

describe('QrPairingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adb.checkMdns.mockResolvedValue(ok(undefined));
    adb.listMdnsServices.mockResolvedValue(ok([]));
    adb.pair.mockResolvedValue(ok('Dispositivo vinculado.'));
    adb.connect.mockResolvedValue(ok('Conectado a 192.168.1.23:38711.'));
  });

  it('refuses to start when mDNS is unavailable', async () => {
    adb.checkMdns.mockResolvedValue(err('Esta red no permite buscar el teléfono.'));

    expect(await make().start()).toEqual({
      ok: false,
      error: 'Esta red no permite buscar el teléfono.',
    });
  });

  it('creates a Wi-Fi QR payload with a random name and password each time', async () => {
    const service = make();
    const first = await service.start();
    const second = await service.start();

    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      const a = parsePayload(first.value.payload);
      const b = parsePayload(second.value.payload);
      expect(a.name).toMatch(/^manolo-[0-9a-f]{6}$/);
      expect(a.password).toMatch(/^[A-Za-z0-9]{12}$/);
      expect(a.name).not.toBe(b.name);
      expect(a.password).not.toBe(b.password);
    }
  });

  it('pairs with the service that announces our name, then connects to the same phone', async () => {
    const service = make();
    const started = await service.start();
    if (!started.ok) throw new Error('start failed');
    const { name, password } = parsePayload(started.value.payload);
    adb.listMdnsServices.mockResolvedValue(
      ok([pairingService('someone-elses-phone'), pairingService(name), connectService]),
    );

    const result = await service.wait(started.value.sessionId);

    expect(adb.pair).toHaveBeenCalledWith('192.168.1.23:41921', password);
    expect(adb.connect).toHaveBeenCalledWith('192.168.1.23:38711');
    expect(result).toEqual({ ok: true, value: 'Conectado a 192.168.1.23:38711.' });
  });

  it('never pairs with a phone that did not scan our code', async () => {
    const service = make();
    const started = await service.start();
    if (!started.ok) throw new Error('start failed');
    adb.listMdnsServices.mockResolvedValue(ok([pairingService('someone-elses-phone')]));

    const result = await service.wait(started.value.sessionId);

    expect(adb.pair).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });

  it('times out when the phone never shows up', async () => {
    const service = make();
    const started = await service.start();
    if (!started.ok) throw new Error('start failed');

    const result = await service.wait(started.value.sessionId);

    expect(result).toEqual({
      ok: false,
      error: 'No se encontró el teléfono. Revisa que esté en la misma red Wi-Fi.',
    });
  });

  it('reports the adb error when pairing fails', async () => {
    const service = make();
    const started = await service.start();
    if (!started.ok) throw new Error('start failed');
    const { name } = parsePayload(started.value.payload);
    adb.listMdnsServices.mockResolvedValue(ok([pairingService(name)]));
    adb.pair.mockResolvedValue(err('Failed: Wrong password or connection was dropped.'));

    const result = await service.wait(started.value.sessionId);

    expect(result).toEqual({
      ok: false,
      error: 'Failed: Wrong password or connection was dropped.',
    });
    expect(adb.connect).not.toHaveBeenCalled();
  });

  it('is still a success when the phone pairs but does not announce a connect service', async () => {
    const service = make();
    const started = await service.start();
    if (!started.ok) throw new Error('start failed');
    const { name } = parsePayload(started.value.payload);
    adb.listMdnsServices.mockResolvedValue(ok([pairingService(name)]));

    const result = await service.wait(started.value.sessionId);

    expect(result.ok).toBe(true);
    expect(adb.connect).not.toHaveBeenCalled();
  });

  it('stops searching when cancelled', async () => {
    const service = make();
    const started = await service.start();
    if (!started.ok) throw new Error('start failed');
    adb.listMdnsServices.mockImplementation(async () => {
      service.cancel(started.value.sessionId);
      return ok([]);
    });

    const result = await service.wait(started.value.sessionId);

    expect(result).toEqual({ ok: false, error: 'Vinculación cancelada.' });
    expect(adb.pair).not.toHaveBeenCalled();
  });

  it('cancels the previous attempt when a new one starts, and ignores stale sessions', async () => {
    const service = make();
    const first = await service.start();
    await service.start();
    if (!first.ok) throw new Error('start failed');

    const result = await service.wait(first.value.sessionId);

    expect(result).toEqual({ ok: false, error: 'Vinculación cancelada.' });
    expect(adb.listMdnsServices).not.toHaveBeenCalled();
  });
});
