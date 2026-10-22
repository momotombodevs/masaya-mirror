// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { MIRROR_PORT_WINDOW_MESSAGE } from '../../../../../shared/mirror/port-message';
import { registerMirrorPortHandler } from '../mirror-port-delivery';

function portMessage(origin: string, source: Window | null): MessageEvent {
  const { port1 } = new MessageChannel();
  return new MessageEvent('message', {
    data: { type: MIRROR_PORT_WINDOW_MESSAGE, deviceId: 'device-1' },
    origin,
    source,
    ports: [port1],
  });
}

describe('mirror port delivery', () => {
  it('accepts a port from this window whose origin is "null", as in a packaged file:// page', () => {
    const handler = vi.fn();
    const unregister = registerMirrorPortHandler('device-1', handler);

    window.dispatchEvent(portMessage('null', window));

    expect(handler).toHaveBeenCalledOnce();
    unregister();
  });

  it('ignores a port posted by another window', () => {
    const handler = vi.fn();
    const unregister = registerMirrorPortHandler('device-1', handler);

    window.dispatchEvent(portMessage(window.location.origin, null));

    expect(handler).not.toHaveBeenCalled();
    unregister();
  });
});
