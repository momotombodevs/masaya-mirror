import { describe, expect, it } from 'vitest';
import { pickVideoMimeType } from '../recording-formats';

describe('pickVideoMimeType', () => {
  it('prefers MP4 with H.264', () => {
    expect(pickVideoMimeType(() => true)).toBe('video/mp4;codecs=avc1');
  });

  it('falls back to WebM when MP4 cannot be recorded', () => {
    expect(pickVideoMimeType((type) => type.startsWith('video/webm'))).toBe(
      'video/webm;codecs=vp9',
    );
    expect(pickVideoMimeType((type) => type === 'video/webm')).toBe('video/webm');
  });

  it('returns null when nothing can be recorded', () => {
    expect(pickVideoMimeType(() => false)).toBeNull();
  });
});
