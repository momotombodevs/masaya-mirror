import { randomBytes, randomInt } from 'node:crypto';
import { err, ok, type Result } from '../../../shared/ipc/result';
import type { AdbService, MdnsService } from './adb.service';

const PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const PASSWORD_LENGTH = 12;

const SEARCH_TIMEOUT_MS = 120_000;
const CONNECT_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 1_500;

const CANCELLED_MESSAGE = 'Vinculación cancelada.';
const TIMEOUT_MESSAGE = 'No se encontró el teléfono. Revisa que esté en la misma red Wi-Fi.';

export type QrPairingStart = {
  readonly sessionId: string;
  /** Text to draw as a QR code. Android reads it from "Vincular con código QR". */
  readonly payload: string;
};

type Session = {
  readonly id: string;
  readonly name: string;
  readonly password: string;
  cancelled: boolean;
};

export type QrPairingOptions = {
  readonly pollIntervalMs?: number;
  readonly searchTimeoutMs?: number;
  readonly connectTimeoutMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
};

const hostOf = (address: string): string => address.slice(0, address.lastIndexOf(':'));

function randomPassword(): string {
  return Array.from(
    { length: PASSWORD_LENGTH },
    () => PASSWORD_CHARS[randomInt(PASSWORD_CHARS.length)],
  ).join('');
}

/**
 * Pairs a phone by QR: the app shows `WIFI:T:ADB;S:<name>;P:<password>;;`, the phone scans it
 * and announces a pairing service called `<name>` over mDNS, and we pair with its password.
 * Only one pairing runs at a time; starting another cancels the previous one.
 */
export class QrPairingService {
  private session: Session | null = null;
  private readonly pollIntervalMs: number;
  private readonly searchTimeoutMs: number;
  private readonly connectTimeoutMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly adbService: Pick<
      AdbService,
      'checkMdns' | 'listMdnsServices' | 'pair' | 'connect'
    >,
    options: QrPairingOptions = {},
  ) {
    this.pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS;
    this.searchTimeoutMs = options.searchTimeoutMs ?? SEARCH_TIMEOUT_MS;
    this.connectTimeoutMs = options.connectTimeoutMs ?? CONNECT_TIMEOUT_MS;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async start(): Promise<Result<QrPairingStart>> {
    this.cancelCurrent();
    const mdns = await this.adbService.checkMdns();
    if (!mdns.ok) {
      return mdns;
    }
    const session: Session = {
      id: randomBytes(8).toString('hex'),
      name: `manolo-${randomBytes(3).toString('hex')}`,
      password: randomPassword(),
      cancelled: false,
    };
    this.session = session;
    return ok({
      sessionId: session.id,
      payload: `WIFI:T:ADB;S:${session.name};P:${session.password};;`,
    });
  }

  cancel(sessionId: string): void {
    if (this.session?.id === sessionId) {
      this.cancelCurrent();
    }
  }

  private cancelCurrent(): void {
    if (this.session) {
      this.session.cancelled = true;
      this.session = null;
    }
  }

  /** Resolves once the phone scanned the code, paired and connected, or when time runs out. */
  async wait(sessionId: string): Promise<Result<string>> {
    const session = this.session;
    if (!session || session.id !== sessionId) {
      return err(CANCELLED_MESSAGE);
    }

    const pairing = await this.poll(session, this.searchTimeoutMs, (services) =>
      services.find((service) => service.kind === 'pairing' && service.name === session.name),
    );
    if (!pairing) {
      return err(session.cancelled ? CANCELLED_MESSAGE : TIMEOUT_MESSAGE);
    }

    const paired = await this.adbService.pair(pairing.address, session.password);
    if (!paired.ok) {
      this.finish(session);
      return paired;
    }

    // Phones usually announce a connect service right after pairing. adb may connect by itself.
    const host = hostOf(pairing.address);
    const connectable = await this.poll(session, this.connectTimeoutMs, (services) =>
      services.find((service) => service.kind === 'connect' && hostOf(service.address) === host),
    );
    this.finish(session);
    if (!connectable) {
      return ok('Teléfono vinculado. Aparecerá en la lista en unos segundos.');
    }
    return this.adbService.connect(connectable.address);
  }

  private finish(session: Session): void {
    if (this.session === session) {
      this.session = null;
    }
  }

  private async poll(
    session: Session,
    timeoutMs: number,
    find: (services: readonly MdnsService[]) => MdnsService | undefined,
  ): Promise<MdnsService | null> {
    for (let waited = 0; waited <= timeoutMs && !session.cancelled; waited += this.pollIntervalMs) {
      const listed = await this.adbService.listMdnsServices();
      const found = listed.ok ? find(listed.value) : undefined;
      if (found) {
        return found;
      }
      await this.sleep(this.pollIntervalMs);
    }
    return null;
  }
}
