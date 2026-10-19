import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { access } from 'node:fs/promises';
import { augmentProcessPath, resolveAdbPath } from '../adb-path.resolver';

vi.mock('node:fs/promises', () => ({
  access: vi.fn(),
}));

const mockedAccess = vi.mocked(access);

describe('augmentProcessPath', () => {
  const originalPath = process.env.PATH;

  afterEach(() => {
    process.env.PATH = originalPath;
  });

  it('prepends Android SDK platform-tools to PATH', () => {
    process.env.PATH = '/usr/bin';
    process.env.ANDROID_HOME = '/Users/test/Android/sdk';

    augmentProcessPath();

    expect(process.env.PATH?.split(':')).toContain('/Users/test/Android/sdk/platform-tools');
    expect(process.env.PATH?.startsWith('/Users/test/Android/sdk/platform-tools')).toBe(true);
  });

  it('adds Windows SDK directories when LOCALAPPDATA is available', () => {
    process.env.PATH = '/usr/bin';
    process.env.LOCALAPPDATA = 'C:\\Users\\test\\AppData\\Local';

    augmentProcessPath();

    expect(process.env.PATH).toContain(
      'C:\\Users\\test\\AppData\\Local/Android/Sdk/platform-tools',
    );
  });
});

describe('resolveAdbPath', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ADB_PATH;
    delete process.env.ANDROID_HOME;
    delete process.env.ANDROID_SDK_ROOT;
  });

  it('returns ADB_PATH when executable', async () => {
    process.env.ADB_PATH = '/custom/adb';
    mockedAccess.mockResolvedValue(undefined);

    const resolved = await resolveAdbPath();

    expect(resolved).toBe('/custom/adb');
  });

  it('returns null when no candidate is executable', async () => {
    mockedAccess.mockRejectedValue(new Error('ENOENT'));

    const resolved = await resolveAdbPath();

    expect(resolved).toBeNull();
  });

  it('resolves from ANDROID_HOME platform-tools', async () => {
    process.env.ANDROID_HOME = '/Users/test/Android/sdk';
    mockedAccess.mockImplementation(async (filePath) => {
      if (String(filePath).endsWith('/Users/test/Android/sdk/platform-tools/adb')) {
        return;
      }
      throw new Error('ENOENT');
    });

    const resolved = await resolveAdbPath();

    expect(resolved).toBe('/Users/test/Android/sdk/platform-tools/adb');
  });
});

describe('resolveAdbPath with a custom path', () => {
  beforeEach(() => {
    mockedAccess.mockReset();
  });

  it('checks the user-chosen adb before anything else', async () => {
    mockedAccess.mockImplementation(async (candidate) => {
      if (candidate !== '/opt/chosen/adb') {
        throw new Error('ENOENT');
      }
    });

    expect(await resolveAdbPath('/opt/chosen/adb')).toBe('/opt/chosen/adb');
    expect(mockedAccess.mock.calls[0]?.[0]).toBe('/opt/chosen/adb');
  });

  it('falls back to the usual locations when the custom path is gone', async () => {
    mockedAccess.mockImplementation(async (candidate) => {
      if (candidate !== '/usr/local/bin/adb') {
        throw new Error('ENOENT');
      }
    });
    process.env.PATH = '/usr/local/bin';

    expect(await resolveAdbPath('/gone/adb')).toBe('/usr/local/bin/adb');
  });
});
