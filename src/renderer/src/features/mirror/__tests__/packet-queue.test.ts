import { describe, expect, it } from 'vitest';
import type { ScrcpyMediaStreamPacket } from '@yume-chan/scrcpy';
import { createPacketQueue } from '../packet-queue';

const config = (): ScrcpyMediaStreamPacket =>
  ({ type: 'configuration', data: new Uint8Array([0]) }) as ScrcpyMediaStreamPacket;

const frame = (keyframe: boolean, id: number): ScrcpyMediaStreamPacket =>
  ({ type: 'data', keyframe, data: new Uint8Array([id]) }) as ScrcpyMediaStreamPacket;

const idOf = (packet: ScrcpyMediaStreamPacket | null): number | null =>
  packet ? packet.data[0] ?? null : null;

describe('createPacketQueue', () => {
  it('delivers packets in order', async () => {
    const queue = createPacketQueue(10);
    queue.push(config());
    queue.push(frame(true, 1));
    queue.push(frame(false, 2));

    expect(idOf(await queue.next())).toBe(0);
    expect(idOf(await queue.next())).toBe(1);
    expect(idOf(await queue.next())).toBe(2);
  });

  it('resolves a waiting consumer as soon as a packet arrives', async () => {
    const queue = createPacketQueue(10);
    const pending = queue.next();
    queue.push(frame(true, 7));
    expect(idOf(await pending)).toBe(7);
  });

  it('drops stale frames when the backlog grows and resumes at the next keyframe', async () => {
    const queue = createPacketQueue(2);
    queue.push(config());
    queue.push(frame(true, 1));
    queue.push(frame(false, 2));
    expect(queue.size).toBe(1);

    queue.push(frame(false, 3));
    expect(queue.size).toBe(1);
    queue.push(frame(true, 5));
    expect(queue.size).toBe(2);

    expect(idOf(await queue.next())).toBe(0);
    expect(idOf(await queue.next())).toBe(5);
  });

  it('keeps the keyframe that overflows the queue', async () => {
    const queue = createPacketQueue(2);
    queue.push(config());
    queue.push(frame(false, 1));
    queue.push(frame(true, 2));

    expect(idOf(await queue.next())).toBe(0);
    expect(idOf(await queue.next())).toBe(2);
    queue.push(frame(false, 3));
    expect(idOf(await queue.next())).toBe(3);
  });

  it('resolves null for waiting consumers when closed', async () => {
    const queue = createPacketQueue(10);
    const pending = queue.next();
    queue.close();
    expect(await pending).toBeNull();
    queue.push(frame(true, 1));
    expect(await queue.next()).toBeNull();
  });
});
