import { MessageChannelMain, type WebContents } from 'electron';
import { err, ok, type Result } from '../../../shared/ipc/result';
import { runCommand } from '../../utils/runCommand';
import {
  DEFAULT_MIRROR_OPTIONS,
  type MirrorControlMessage,
  type MirrorOptions,
} from '../../../shared/mirror/types';
import { MIRROR_CHANNELS, type OpenMirrorSuccess } from '../../../shared/ipc/mirror.contract';
import {
  getExpectedScrcpyServerPath,
  resolveScrcpyServerPath,
} from './scrcpy-server-path.resolver';
import { MirrorStreamSession } from './mirror-stream.session';
import { ADB_NOT_FOUND_MESSAGE } from '../device/adb-error';
import type { AdbServerClient } from '@yume-chan/adb';
import type {
  AndroidKeyCode,
  AndroidKeyEventAction,
  AndroidKeyEventMeta,
  AndroidMotionEventAction,
  ScrcpyControlMessageWriter,
} from '@yume-chan/scrcpy';
import type { AdbService } from '../device/adb.service';

const SCRCPY_SERVER_NOT_FOUND = 'Falta scrcpy-server. Ejecuta `pnpm setup:tools`.';

type ScrcpyClientHandle = {
  readonly close: () => Promise<void>;
  readonly exited: Promise<void>;
};

type MirrorSession = {
  readonly deviceId: string;
  readonly stream: MirrorStreamSession;
  readonly client: ScrcpyClientHandle;
  readonly controller: ScrcpyControlMessageWriter | undefined;
  readonly options: MirrorOptions;
  readonly audioEnabled: boolean;
  /** Tail of the control queue. Each control message waits for the previous one. */
  controlChain: Promise<unknown>;
};

export class ScrcpyService {
  private readonly sessions = new Map<string, MirrorSession>();
  private adbServerClient: AdbServerClient | null = null;

  constructor(private readonly adbService: AdbService) {}

  getActiveMirrors(): readonly string[] {
    return [...this.sessions.keys()];
  }

  private async getTango() {
    return import('./mirror-tango.js');
  }

  private async getAdbServerClient() {
    if (this.adbServerClient) {
      return this.adbServerClient;
    }

    const adbPath = await this.adbService.getExecutablePath();
    if (!adbPath) {
      throw new Error(ADB_NOT_FOUND_MESSAGE);
    }

    await runCommand(adbPath, ['start-server']);

    const tango = await this.getTango();
    this.adbServerClient = await tango.createAdbServerClient();
    return this.adbServerClient;
  }

  async openMirror(
    deviceId: string,
    webContents: WebContents,
    options: MirrorOptions = DEFAULT_MIRROR_OPTIONS,
  ): Promise<Result<OpenMirrorSuccess>> {
    if (this.sessions.has(deviceId)) {
      await this.closeMirror(deviceId);
    }

    const serverPath = await resolveScrcpyServerPath();
    if (!serverPath) {
      return err(`${SCRCPY_SERVER_NOT_FOUND} Ruta: ${getExpectedScrcpyServerPath()}`);
    }

    let startedClient: { close: () => Promise<void> } | null = null;
    let stored = false;
    try {
      const tango = await this.getTango();
      const adbServer = await this.getAdbServerClient();
      const adb = await tango.createDeviceAdb(adbServer, deviceId);
      await tango.pushScrcpyServer(adb, serverPath);

      const started = await tango.startScrcpyClient(adb, options);
      const { client, metadata, audioCodec, audioWebCodecId, videoStream, audioStream } = started;
      startedClient = client;

      const { port1, port2 } = new MessageChannelMain();
      const abort = new AbortController();

      port1.start();
      webContents.postMessage(MIRROR_CHANNELS.port, { deviceId }, [port2]);

      const streamSession = new MirrorStreamSession({
        deviceId,
        port: port1,
        abort,
        metadata,
        audioCodec,
        audioWebCodecId,
        videoStream,
        audioStream,
      });

      const session: MirrorSession = {
        deviceId,
        stream: streamSession,
        client: {
          close: () => client.close(),
          exited: client.exited,
        },
        controller: client.controller,
        options,
        audioEnabled: options.audioEnabled && audioWebCodecId !== null,
        controlChain: Promise.resolve(),
      };
      this.sessions.set(deviceId, session);
      stored = true;

      // A replaced session also exits; only the session still registered may close the device.
      void client.exited.then(() => {
        if (this.sessions.get(deviceId) === session) {
          void this.closeMirror(deviceId);
        }
      });

      return ok({
        metadata,
        audioEnabled: session.audioEnabled,
      });
    } catch (error: unknown) {
      if (error instanceof Error) {
        return err(error.message);
      }
      return err('No se pudo iniciar el espejo.');
    } finally {
      if (!stored && startedClient) {
        await startedClient.close().catch(() => undefined);
      }
    }
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

    // Control messages run strictly in arrival order, one at a time per device.
    const result = session.controlChain.then(() => this.dispatchControl(session, message));
    session.controlChain = result.then(
      () => undefined,
      () => undefined,
    );
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

  async setOptions(
    deviceId: string,
    webContents: WebContents,
    options: MirrorOptions,
  ): Promise<Result<OpenMirrorSuccess>> {
    // Restarting must not tell the window the stream ended, or it would close itself.
    await this.closeMirror(deviceId, { notifyRenderer: false });
    return this.openMirror(deviceId, webContents, options);
  }

  async closeMirror(
    deviceId: string,
    { notifyRenderer = true }: { notifyRenderer?: boolean } = {},
  ): Promise<Result<void>> {
    const session = this.sessions.get(deviceId);
    if (!session) {
      return ok(undefined);
    }

    session.stream.close(undefined, { notifyRenderer });

    try {
      await session.client.close();
    } catch {
      // Session may already be closed.
    }

    this.sessions.delete(deviceId);
    return ok(undefined);
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((deviceId) => this.closeMirror(deviceId)));
  }
}
