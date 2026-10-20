import { beforeEach, describe, expect, it, vi } from 'vitest';
import { session } from 'electron';
import { registerPermissionPolicy } from '../window-security';

vi.mock('electron', () => ({
  session: {
    defaultSession: {
      setPermissionRequestHandler: vi.fn(),
      setPermissionCheckHandler: vi.fn(),
    },
  },
}));

describe('registerPermissionPolicy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerPermissionPolicy();
  });

  const requestHandler = () =>
    vi.mocked(session.defaultSession.setPermissionRequestHandler).mock.calls[0]?.[0] as (
      webContents: unknown,
      permission: string,
      callback: (granted: boolean) => void,
    ) => void;

  const checkHandler = () =>
    vi.mocked(session.defaultSession.setPermissionCheckHandler).mock.calls[0]?.[0] as (
      webContents: unknown,
      permission: string,
    ) => boolean;

  it.each([
    'media',
    'geolocation',
    'notifications',
    'clipboard-read',
    'clipboard-sanitized-write',
    'midi',
    'openExternal',
  ])('denies the %s permission request', (permission) => {
    const callback = vi.fn();

    requestHandler()(null, permission, callback);

    expect(callback).toHaveBeenCalledWith(false);
    expect(checkHandler()(null, permission)).toBe(false);
  });

  it('keeps the fullscreen button working', () => {
    const callback = vi.fn();

    requestHandler()(null, 'fullscreen', callback);

    expect(callback).toHaveBeenCalledWith(true);
    expect(checkHandler()(null, 'fullscreen')).toBe(true);
  });
});
