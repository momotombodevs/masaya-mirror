import { MessageChannelMain, type WebContents } from 'electron';
import { err, ok, type Result } from '../../../shared/ipc/result';
import { runCommand } from '../../utils/runCommand';
import {
  ANDROID_MOTION_EVENT_ACTION,
  DEFAULT_MIRROR_OPTIONS,
  type MirrorControlMessage,
  type MirrorOptions,
} from '../../../shared/mirror/types';
import { MIRROR_CHANNELS, type OpenMirrorSuccess } from '../../../shared/ipc/mirror.contract';
import {
  getExpectedScrcpyServerPath,
  resolveScrcpyServerPath,
} from './scrcpy-server-path.resolver';
import { ClipboardSync } from './clipboard-sync';
import { systemClipboard } from './system-clipboard';
import { MirrorStreamSession } from './mirror-stream.session';
import { mt } from '../../i18n';
import { AdbNotFoundError, adbNotFound } from '../device/adb-error';
import type { Adb, AdbServerClient } from '@yume-chan/adb';
import type {
  AndroidKeyCode,
  AndroidKeyEventAction,
  AndroidKeyEventMeta,
  AndroidMotionEventAction,
  ScrcpyControlMessageWriter,
} from '@yume-chan/scrcpy';
import type { AdbService } from '../device/adb.service';
import type * as MirrorTangoModule from './mirror-tango.js';

type MirrorTango = typeof MirrorTangoModule;

type ScrcpyClientHandle = {
  readonly close: () => Promise<void>;
};

/** Control messages queued per session beyond which pointer moves are dropped, not queued. */
export const MAX_PENDING_CONTROLS = 64;

type MirrorSession = {
  readonly stream: MirrorStreamSession;
  readonly client: ScrcpyClientHandle;
  /** The connection to the device, which the scrcpy client does not close. */
  readonly adb: Pick<Adb, 'close'>;
  readonly controller: ScrcpyControlMessageWriter | undefined;
  readonly audioEnabled: boolean;
  readonly clipboard: ClipboardSync | null;
  /** Tail of the control queue. Each control message waits for the previous one. */
  controlChain: Promise<unknown>;
  /** Control messages accepted but not finished yet. */
  pendingControls: number;
};

const KEYCODE_V = 50;
/** Android meta-state bits for Ctrl and Meta (Cmd on macOS), either side. */
const PASTE_MODIFIERS = 0x1000 | 0x2000 | 0x10000 | 0x20000;
const KEY_ACTION_DOWN = 0;

function isPasteShortcut(message: MirrorControlMessage): boolean {
  return (
    message.type === 'key' &&
    message.action === KEY_ACTION_DOWN &&
    message.keyCode === KEYCODE_V &&
    (message.metaState & PASTE_MODIFIERS) !== 0
  );
}

/** Runs a teardown step whose failure changes nothing: the thing it closes is already gone. */
async function closeQuietly(close: () => unknown): Promise<void> {
  try {
    await close();
  } catch {
    // Already closed, or the device went away while closing.
  }
}

function isTouchMove(message: MirrorControlMessage): boolean {
  return message.type === 'touch' && message.action === ANDROID_MOTION_EVENT_ACTION.move;
}

export class ScrcpyService {
  private readonly sessions = new Map<string, MirrorSession>();
  /** Tail of the open/restart queue per device, so two starts never interleave. */
  private readonly startChains = new Map<string, Promise<unknown>>();
  private adbServerClient: AdbServerClient | null = null;
  private tango: Promise<MirrorTango> | null = null;

  constructor(private readonly adbService: AdbService) {}

  /** The adb/scrcpy libraries are heavy, so they load on first use, once. */
  private getTango(): Promise<MirrorTango> {
    this.tango ??= import('./mirror-tango.js');
    return this.tango;
  }

  private async getAdbServerClient() {
    if (this.adbServerClient) {
      return this.adbServerClient;
    }

    const adbPath = await this.adbService.getExecutablePath();
    if (!adbPath) {
      throw new AdbNotFoundError();
    }

    await runCommand(adbPath, ['start-server']);

    const tango = await this.getTango();
    this.adbServerClient = tango.createAdbServerClient();
    return this.adbServerClient;
  }

  private enqueueStart<T>(deviceId: string, task: () => Promise<T>): Promise<T> {
    const run = (this.startChains.get(deviceId) ?? Promise.resolve()).then(task);
    const tail = run.then(
      () => undefined,
      () => undefined,
    );
    this.startChains.set(deviceId, tail);
    void tail.then(() => {
      if (this.startChains.get(deviceId) === tail) {
        this.startChains.delete(deviceId);
      }
    });
    return run;
  }

  openMirror(
    deviceId: string,
    webContents: WebContents,
    options: MirrorOptions = DEFAULT_MIRROR_OPTIONS,
  ): Promise<Result<OpenMirrorSuccess>> {
    return this.enqueueStart(deviceId, () => this.startMirror(deviceId, webContents, options));
  }

  private async startMirror(
    deviceId: string,
    webContents: WebContents,
    options: MirrorOptions,
  ): Promise<Result<OpenMirrorSuccess>> {
    if (this.sessions.has(deviceId)) {
      await this.closeMirror(deviceId);
    }

    const serverPath = await resolveScrcpyServerPath();
    if (!serverPath) {
      return err(mt('main.scrcpyMissing', { path: getExpectedScrcpyServerPath() }));
    }

    let adb: Adb | null = null;
    let startedClient: ScrcpyClientHandle | null = null;
    let stored = false;
    try {
      const tango = await this.getTango();
      const adbServer = await this.getAdbServerClient();
      const deviceAdb = await tango.createDeviceAdb(adbServer, deviceId);
      adb = deviceAdb;
      await tango.pushScrcpyServer(deviceAdb, serverPath);

      const started = await tango.startScrcpyClient(deviceAdb, options);
      const { client, metadata, audioCodec, audioWebCodecId, videoStream, audioStream, clipboard } =
        started;
      startedClient = client;

      const { port1, port2 } = new MessageChannelMain();

      port1.start();
      webContents.postMessage(MIRROR_CHANNELS.port, { deviceId }, [port2]);

      const streamSession = new MirrorStreamSession({
        deviceId,
        port: port1,
        metadata,
        audioCodec,
        audioWebCodecId,
        videoStream,
        audioStream,
      });

      const controller = client.controller;
      const clipboardSync =
        options.clipboardSync && clipboard && controller
          ? new ClipboardSync({
              system: systemClipboard,
              deviceText: clipboard,
              setDeviceText: (content) =>
                controller.setClipboard({ content, paste: false, sequence: 0n }),
            })
          : null;

      const session: MirrorSession = {
        stream: streamSession,
        client: { close: () => client.close() },
        adb: deviceAdb,
        controller,
        audioEnabled: options.audioEnabled && audioWebCodecId !== null,
        clipboard: clipboardSync,
        controlChain: Promise.resolve(),
        pendingControls: 0,
      };
      // The window may have closed during startup; nobody would ever close this session.
      if (webContents.isDestroyed()) {
        clipboardSync?.stop();
        streamSession.close(undefined, { notifyRenderer: false });
        return err(mt('main.mirrorStartFailed'));
      }
      this.sessions.set(deviceId, session);
      stored = true;
      clipboardSync?.start();
      void clipboardSync?.pushToDevice();

      // A replaced session also exits; only the session still registered may close the device.
      const onExited = (): void => {
        if (this.sessions.get(deviceId) === session) {
          void this.closeMirror(deviceId);
        }
      };
      client.exited.then(onExited, onExited);

      return ok({
        metadata,
        audioEnabled: session.audioEnabled,
      });
    } catch (error: unknown) {
      if (error instanceof AdbNotFoundError) {
        return adbNotFound();
      }
      if (error instanceof Error) {
        return err(error.message);
      }
      return err(mt('main.mirrorStartFailed'));
    } finally {
      if (!stored) {
        // Startup already failed (or was abandoned); the original outcome is what matters.
        await closeQuietly(() => startedClient?.close());
        await closeQuietly(() => adb?.close());
      }
    }
  }

  /** Called when a mirror window gains focus: whatever was copied meanwhile goes to the device. */
  async syncClipboardToDevice(deviceId: string): Promise<void> {
    await this.sessions.get(deviceId)?.clipboard?.pushToDevice();
  }

  notifyStreamReady(deviceId: string): Result<void> {
    const session = this.sessions.get(deviceId);
    if (!session) {
      return err('No mirror session exists for this device.');
    }

    session.stream.onRendererReady();
    return ok(undefined);
  }

  async sendControl(deviceId: string, message: MirrorControlMessage): Promise<Result<void>> {
    const session = this.sessions.get(deviceId);
    if (!session) {
      return err('No active mirror exists for this device.');
    }

    // A slow device must not build an unbounded backlog. Pointer moves are superseded by the
    // next one, so they are the only thing dropped; presses, releases and typing never are.
    if (session.pendingControls >= MAX_PENDING_CONTROLS && isTouchMove(message)) {
      return ok(undefined);
    }

    // Control messages run strictly in arrival order, one at a time per device.
    session.pendingControls += 1;
    const result = session.controlChain.then(async () => {
      // A paste must find the computer's current clipboard on the device.
      if (isPasteShortcut(message)) {
        await session.clipboard?.pushToDevice();
      }
      return this.dispatchControl(session, message);
    });
    const settled = (): void => {
      session.pendingControls -= 1;
    };
    session.controlChain = result.then(settled, settled);
    return result;
  }

  private async dispatchControl(
    session: MirrorSession,
    message: MirrorControlMessage,
  ): Promise<Result<void>> {
    const controller = session.controller;
    if (!controller) {
      return err('Control is not available for this session.');
    }

    try {
      switch (message.type) {
        case 'touch':
          await controller.injectTouch({
            action: message.action as AndroidMotionEventAction,
            pointerId: BigInt(message.pointerId),
            pointerX: message.pointerX,
            pointerY: message.pointerY,
            videoWidth: message.videoWidth,
            videoHeight: message.videoHeight,
            pressure: message.pressure,
            buttons: message.buttons,
            actionButton: message.actionButton,
          });
          break;
        case 'scroll':
          await controller.injectScroll({
            pointerX: message.pointerX,
            pointerY: message.pointerY,
            videoWidth: message.videoWidth,
            videoHeight: message.videoHeight,
            scrollX: message.scrollX,
            scrollY: message.scrollY,
            buttons: message.buttons,
          });
          break;
        case 'key':
          await controller.injectKeyCode({
            action: message.action as AndroidKeyEventAction,
            keyCode: message.keyCode as AndroidKeyCode,
            repeat: message.repeat,
            metaState: message.metaState as AndroidKeyEventMeta,
          });
          break;
        case 'text':
          await controller.injectText(message.text);
          break;
        case 'rotate':
          await controller.rotateDevice();
          break;
        default: {
          const _exhaustive: never = message;
          return err(`Unknown control: ${String(_exhaustive)}`);
        }
      }
      return ok(undefined);
    } catch (error: unknown) {
      if (error instanceof Error) {
        return err(error.message);
      }
      return err('Unable to send the control event.');
    }
  }

  setOptions(
    deviceId: string,
    webContents: WebContents,
    options: MirrorOptions,
  ): Promise<Result<OpenMirrorSuccess>> {
    return this.enqueueStart(deviceId, async () => {
      // Restarting must not tell the window the stream ended, or it would close itself.
      await this.closeMirror(deviceId, { notifyRenderer: false });
      return this.startMirror(deviceId, webContents, options);
    });
  }

  async closeMirror(
    deviceId: string,
    { notifyRenderer = true }: { notifyRenderer?: boolean } = {},
  ): Promise<Result<void>> {
    const session = this.sessions.get(deviceId);
    if (!session) {
      return ok(undefined);
    }

    session.clipboard?.stop();
    session.stream.close(undefined, { notifyRenderer });

    // Either may already be closed (the device exited or was unplugged); nothing to do then.
    await closeQuietly(() => session.client.close());
    await closeQuietly(() => session.adb.close());

    this.sessions.delete(deviceId);
    return ok(undefined);
  }

  hasOpenSessions(): boolean {
    return this.sessions.size > 0;
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((deviceId) => this.closeMirror(deviceId)));
  }
}
