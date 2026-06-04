import { describe, expect, it, vi, beforeEach } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { QaService } from '../qa.service';
import type { AdbService } from '../../device/adb.service';
import { runCommandBuffer } from '../../../utils/runCommand';

vi.mock('../../../utils/runCommand', () => ({
  runCommandBuffer: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn(),
}));

const mockedRunCommandBuffer = vi.mocked(runCommandBuffer);
const mockedWriteFile = vi.mocked(writeFile);

describe('QaService', () => {
  const adbService = {
    getExecutablePath: vi.fn().mockResolvedValue('/usr/local/bin/adb'),
  } as unknown as AdbService;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('takes screenshot using resolved adb path', async () => {
    mockedRunCommandBuffer.mockResolvedValue(Buffer.from('png'));

    const service = new QaService(adbService);
    const result = await service.takeScreenshot('RF8X309MHHJ', '/tmp/shot.png');

    expect(result.ok).toBe(true);
    expect(mockedRunCommandBuffer).toHaveBeenCalledWith('/usr/local/bin/adb', [
      '-s',
      'RF8X309MHHJ',
      'exec-out',
      'screencap',
      '-p',
    ]);
    expect(mockedWriteFile).toHaveBeenCalledWith('/tmp/shot.png', Buffer.from('png'));
  });

  it('returns error when adb is missing', async () => {
    const missingAdb = {
      getExecutablePath: vi.fn().mockResolvedValue(null),
    } as unknown as AdbService;

    const service = new QaService(missingAdb);
    const result = await service.takeScreenshot('RF8X309MHHJ', '/tmp/shot.png');

    expect(result.ok).toBe(false);
    expect(mockedRunCommandBuffer).not.toHaveBeenCalled();
  });
});
