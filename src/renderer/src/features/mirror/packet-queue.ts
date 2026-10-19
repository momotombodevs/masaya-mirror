import type { ScrcpyMediaStreamPacket } from '@yume-chan/scrcpy';

/**
 * Maximum number of video packets kept waiting for the decoder. Beyond this,
 * stale data packets are dropped until the next keyframe so the picture catches
 * up with the device instead of drifting further behind over time.
 */
export const MAX_PENDING_VIDEO_PACKETS = 4;

export type PacketQueue = {
  /** Adds a packet. Configuration packets are never dropped. */
  push(packet: ScrcpyMediaStreamPacket): void;
  /** Resolves with the next packet, or `null` once the queue is closed. */
  next(): Promise<ScrcpyMediaStreamPacket | null>;
  close(): void;
  readonly size: number;
};

export function createPacketQueue(maxPending = MAX_PENDING_VIDEO_PACKETS): PacketQueue {
  const items: ScrcpyMediaStreamPacket[] = [];
  const waiters: Array<(packet: ScrcpyMediaStreamPacket | null) => void> = [];
  let closed = false;
  let waitingForKeyframe = false;

  const dropStaleDataPackets = (): void => {
    const kept = items.filter((packet) => packet.type === 'configuration');
    items.length = 0;
    items.push(...kept);
    waitingForKeyframe = true;
  };

  return {
    push(packet) {
      if (closed) {
        return;
      }

      if (packet.type === 'data' && waitingForKeyframe) {
        if (!packet.keyframe) {
          return;
        }
        waitingForKeyframe = false;
      }

      const waiter = waiters.shift();
      if (waiter) {
        waiter(packet);
        return;
      }

      items.push(packet);
      if (items.length > maxPending) {
        dropStaleDataPackets();
      }
    },
    next() {
      const packet = items.shift();
      if (packet) {
        return Promise.resolve(packet);
      }
      if (closed) {
        return Promise.resolve(null);
      }
      return new Promise((resolve) => {
        waiters.push(resolve);
      });
    },
    close() {
      closed = true;
      for (const waiter of waiters.splice(0)) {
        waiter(null);
      }
    },
    get size() {
      return items.length;
    },
  };
}
