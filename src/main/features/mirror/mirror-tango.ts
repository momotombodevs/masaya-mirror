import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { AdbServerClient } from '@yume-chan/adb';
import { AdbServerNodeTcpConnector } from '@yume-chan/adb-server-node-tcp';
import {
  AdbScrcpyClient,
  AdbScrcpyOptionsLatest,
  type AdbScrcpyClient as AdbScrcpyClientType,
} from '@yume-chan/adb-scrcpy';
import {
  DefaultServerPath,
  ScrcpyVideoCodecId,
  type ScrcpyMediaStreamPacket,
} from '@yume-chan/scrcpy';
import type { ReadableStream } from '@yume-chan/stream-extra';
import type { MirrorOptions, MirrorVideoMetadata } from '../../../shared/mirror/types';
import type { Adb } from '@yume-chan/adb';

function mapVideoCodec(codec: MirrorOptions['videoCodec']): 'h264' | 'h265' | 'av1' {
  return codec;
}

export function mapScrcpyVideoCodecId(codec: MirrorOptions['videoCodec']): ScrcpyVideoCodecId {
  switch (codec) {
    case 'h265':
      return ScrcpyVideoCodecId.H265;
    case 'av1':
      return ScrcpyVideoCodecId.AV1;
    default:
      return ScrcpyVideoCodecId.H264;
  }
}

export function buildScrcpyOptions(options: MirrorOptions): AdbScrcpyOptionsLatest<true> {
  return new AdbScrcpyOptionsLatest({
    maxSize: options.maxSize,
    videoBitRate: options.videoBitRate,
    videoCodec: mapVideoCodec(options.videoCodec),
    audio: options.audioEnabled,
    control: true,
    sendFrameMeta: true,
    sendCodecMeta: true,
    sendDeviceMeta: true,
  });
}

export async function createAdbServerClient(): Promise<AdbServerClient> {
  const connector = new AdbServerNodeTcpConnector({ host: '127.0.0.1', port: 5037 });
  return new AdbServerClient(connector);
}

export async function createDeviceAdb(
  client: AdbServerClient,
  deviceId: string,
): Promise<Adb> {
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
}> {
  const scrcpyOptions = buildScrcpyOptions(options);
  const client = await AdbScrcpyClient.start(adb, DefaultServerPath, scrcpyOptions);
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
  };
}

export type { AdbScrcpyClientType };
