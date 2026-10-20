import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { AdbServerClient } from '@yume-chan/adb';
import { AdbServerNodeTcpConnector } from '@yume-chan/adb-server-node-tcp';
import {
  AdbScrcpyClient,
  AdbScrcpyOptionsLatest,
  type AdbScrcpyClient as AdbScrcpyClientType,
} from '@yume-chan/adb-scrcpy';
import { DefaultServerPath, type ScrcpyMediaStreamPacket } from '@yume-chan/scrcpy';
import type { ReadableStream } from '@yume-chan/stream-extra';
import type { MirrorOptions, MirrorVideoMetadata } from '../../../shared/mirror/types';
import type { Adb } from '@yume-chan/adb';

function buildScrcpyOptions(options: MirrorOptions): AdbScrcpyOptionsLatest<true> {
  return new AdbScrcpyOptionsLatest({
    maxSize: options.maxSize,
    videoBitRate: options.videoBitRate,
    videoCodec: options.videoCodec,
    audio: options.audioEnabled,
    control: true,
    clipboardAutosync: options.clipboardSync,
    sendFrameMeta: true,
    sendCodecMeta: true,
    sendDeviceMeta: true,
  });
}

export function createAdbServerClient(): AdbServerClient {
  const connector = new AdbServerNodeTcpConnector({ host: '127.0.0.1', port: 5037 });
  return new AdbServerClient(connector);
}

export async function createDeviceAdb(client: AdbServerClient, deviceId: string): Promise<Adb> {
  return client.createAdb({ serial: deviceId });
}

export async function pushScrcpyServer(adb: Adb, serverPath: string): Promise<void> {
  const serverBytes = await readFile(serverPath);
  const serverStream = Readable.toWeb(Readable.from(serverBytes)) as ReadableStream<Uint8Array>;
  await AdbScrcpyClient.pushServer(adb, serverStream, DefaultServerPath);
}

export async function startScrcpyClient(
  adb: Adb,
  options: MirrorOptions,
): Promise<{
  client: AdbScrcpyClientType<AdbScrcpyOptionsLatest<true>>;
  metadata: MirrorVideoMetadata;
  audioCodec: string | null;
  audioWebCodecId: string | null;
  videoStream: ReadableStream<ScrcpyMediaStreamPacket>;
  audioStream: ReadableStream<ScrcpyMediaStreamPacket> | null;
  clipboard: ReadableStream<string> | null;
}> {
  const scrcpyOptions = buildScrcpyOptions(options);
  const client = await AdbScrcpyClient.start(adb, DefaultServerPath, scrcpyOptions);
  try {
    return await readStartedStreams(client, options);
  } catch (error: unknown) {
    // The caller never sees the client on failure, so it must not outlive this call.
    // Already failing: a second error from tearing the client down would only hide the first.
    await client.close().catch(() => undefined);
    throw error;
  }
}

async function readStartedStreams(
  client: AdbScrcpyClientType<AdbScrcpyOptionsLatest<true>>,
  options: MirrorOptions,
) {
  const videoStreamResult = await client.videoStream;

  const metadata: MirrorVideoMetadata = {
    codec: videoStreamResult.metadata.codec,
    width: videoStreamResult.width,
    height: videoStreamResult.height,
  };

  let audioCodec: string | null = null;
  let audioWebCodecId: string | null = null;
  let audioPacketStream: ReadableStream<ScrcpyMediaStreamPacket> | null = null;

  if (options.audioEnabled && client.audioStream) {
    const audioMeta = await client.audioStream;
    if (audioMeta.type === 'success') {
      audioCodec = audioMeta.codec.mimeType;
      audioWebCodecId = audioMeta.codec.webCodecId;
      audioPacketStream = audioMeta.stream;
    }
  }

  return {
    client,
    metadata,
    audioCodec,
    audioWebCodecId,
    videoStream: videoStreamResult.stream,
    audioStream: audioPacketStream,
    clipboard: client.clipboard ?? null,
  };
}
