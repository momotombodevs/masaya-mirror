import type { ScrcpyMediaStreamPacket } from '@yume-chan/scrcpy';

/** The slice of AudioContext the player uses; tests provide a fake. */
export type AudioOutput = {
  readonly currentTime: number;
  resume(): Promise<void>;
  close(): Promise<void>;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer;
  createBufferSource(): AudioBufferSourceNode;
  readonly destination: AudioNode;
};

export type AudioDecoderLike = {
  configure(config: AudioDecoderConfig): void;
  decode(chunk: EncodedAudioChunk): void;
  close(): void;
};

export type MirrorAudioDeps = {
  createOutput: () => AudioOutput;
  createDecoder: (init: {
    output: (data: AudioData) => void;
    error: (error: Error) => void;
  }) => AudioDecoderLike;
  createChunk: (data: Uint8Array, timestampUs: number) => EncodedAudioChunk;
};

const SAMPLE_RATE = 48_000;
const CHANNELS = 2;
/** Playback starts this far ahead of "now" so scheduling jitter does not cause gaps. */
const MIN_LEAD_S = 0.04;
/** More audio queued than this is dropped, so sound cannot drift behind the picture. */
const MAX_QUEUED_S = 0.25;

const browserDeps: MirrorAudioDeps = {
  createOutput: () => new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: 'interactive' }),
  createDecoder: (init) => new AudioDecoder(init),
  createChunk: (data, timestamp) => new EncodedAudioChunk({ type: 'key', timestamp, data }),
};

/**
 * Plays the device audio: decodes the encoded packets with WebCodecs and schedules each decoded
 * block on an AudioContext, keeping the queue short to stay in sync with the video.
 */
export class MirrorAudioPlayer {
  private readonly output: AudioOutput;
  private readonly decoder: AudioDecoderLike;
  private nextStart = 0;
  private clockUs = 0;
  private closed = false;

  constructor(
    private readonly webCodecId: string,
    private readonly deps: MirrorAudioDeps = browserDeps,
  ) {
    this.output = deps.createOutput();
    void this.output.resume().catch(() => undefined);
    this.decoder = deps.createDecoder({
      output: (data) => this.play(data),
      error: (error) => {
        console.error('[audio]', error);
        this.dispose();
      },
    });
    this.decoder.configure({
      codec: webCodecId,
      sampleRate: SAMPLE_RATE,
      numberOfChannels: CHANNELS,
    });
  }

  push(packet: ScrcpyMediaStreamPacket): void {
    if (this.closed) {
      return;
    }
    if (packet.type === 'configuration') {
      // Opus carries everything the decoder needs in each packet; other codecs need their header.
      if (this.webCodecId !== 'opus') {
        this.decoder.configure({
          codec: this.webCodecId,
          sampleRate: SAMPLE_RATE,
          numberOfChannels: CHANNELS,
          description: packet.data,
        });
      }
      return;
    }
    this.clockUs += 20_000;
    try {
      this.decoder.decode(this.deps.createChunk(packet.data, this.clockUs));
    } catch (error) {
      console.error('[audio]', error);
      this.dispose();
    }
  }

  dispose(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    try {
      this.decoder.close();
    } catch {
      // The decoder may already have closed itself after an error.
    }
    void this.output.close().catch(() => undefined);
  }

  private play(data: AudioData): void {
    if (this.closed) {
      data.close();
      return;
    }
    const buffer = this.output.createBuffer(
      data.numberOfChannels,
      data.numberOfFrames,
      data.sampleRate,
    );
    for (let channel = 0; channel < data.numberOfChannels; channel += 1) {
      const samples = new Float32Array(data.numberOfFrames);
      data.copyTo(samples, { planeIndex: channel, format: 'f32-planar' });
      buffer.copyToChannel(samples, channel);
    }
    data.close();

    const now = this.output.currentTime;
    if (this.nextStart < now + MIN_LEAD_S) {
      this.nextStart = now + MIN_LEAD_S;
    } else if (this.nextStart - now > MAX_QUEUED_S) {
      return;
    }
    const source = this.output.createBufferSource();
    source.buffer = buffer;
    source.connect(this.output.destination);
    source.start(this.nextStart);
    this.nextStart += buffer.duration;
  }
}
