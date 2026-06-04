import { describe, it, expect, vi, beforeEach } from 'vitest';
import { access } from 'node:fs/promises';
import { resolveScrcpyServerPath } from '../scrcpy-server-path.resolver';

vi.mock('node:fs/promises', () => ({
  access: vi.fn(),
}));

describe('resolveScrcpyServerPath', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SCRCPY_SERVER_PATH;
  });

  it('returns SCRCPY_SERVER_PATH when readable', async () => {
    process.env.SCRCPY_SERVER_PATH = '/custom/server.jar';
    vi.mocked(access).mockResolvedValue(undefined);

    const path = await resolveScrcpyServerPath();
    expect(path).toBe('/custom/server.jar');
  });

  it('returns null when no candidate is readable', async () => {
    vi.mocked(access).mockRejectedValue(new Error('ENOENT'));
    const path = await resolveScrcpyServerPath();
    expect(path).toBeNull();
  });
});
