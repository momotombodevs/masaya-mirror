import { useEffect } from 'react';
import { getMirrorStreamClient } from './mirror-stream.client';
import { MirrorAudioPlayer, reportAudioError } from './mirror-audio';

/** Plays the device audio while the mirror is shown; silent when the stream carries none. */
export function useMirrorAudio(deviceId: string): void {
  useEffect(() => {
    let player: MirrorAudioPlayer | null = null;

    const unsubscribe = getMirrorStreamClient(deviceId).subscribe({
      onInit: (message) => {
        player?.dispose();
        player = null;
        if (message.audioWebCodecId && typeof AudioDecoder !== 'undefined') {
          try {
            player = new MirrorAudioPlayer(message.audioWebCodecId);
          } catch (error) {
            reportAudioError(error);
          }
        }
      },
      onAudioPacket: (packet) => player?.push(packet),
      onClose: () => {
        player?.dispose();
        player = null;
      },
    });

    return () => {
      unsubscribe();
      player?.dispose();
      player = null;
    };
  }, [deviceId]);
}
