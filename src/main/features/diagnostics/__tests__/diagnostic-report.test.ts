import { describe, expect, it } from 'vitest';
import { err, ok } from '../../../../shared/ipc/result';
import {
  buildDiagnosticReport,
  formatRuntime,
  summarizeAdbVersion,
  type DiagnosticInput,
  type RuntimeInfo,
} from '../diagnostic-report';

const runtime: RuntimeInfo = {
  appVersion: '0.3.1',
  packaged: true,
  electron: '42.1.0',
  chrome: '138.0.1',
  node: '22.1.0',
  platform: 'darwin',
  osVersion: '15.1',
  arch: 'arm64',
};

const input = (overrides: Partial<DiagnosticInput> = {}): DiagnosticInput => ({
  generatedAt: new Date('2026-10-22T17:00:00.000Z'),
  runtime,
  locale: 'es',
  adbPath: '~/Library/Android/sdk/platform-tools/adb',
  adbVersion: ok('Android Debug Bridge version 1.0.41, Version 36.0.0-13206524'),
  devices: ok([
    {
      id: 'R5CW1234',
      status: 'device',
      model: 'SM_S918B',
      displayName: 'Galaxy S23 Ultra',
    },
    { id: 'emulator-5554', status: 'offline' },
  ]),
  eventCounts: [['mirror: control rejected: touch.pointerX', 12]],
  logLines: ['2026-10-22T16:59:00.000Z INFO  [mirror] started R5CW1234'],
  ...overrides,
});

describe('formatRuntime', () => {
  it('names the app, Electron, Chrome, Node and OS versions', () => {
    expect(formatRuntime(runtime)).toBe(
      'Masaya 0.3.1 · Electron 42.1.0 · Chrome 138.0.1 · Node 22.1.0 · darwin 15.1 arm64',
    );
  });

  it('marks a development build', () => {
    expect(formatRuntime({ ...runtime, packaged: false })).toContain('Masaya 0.3.1 (development)');
  });
});

describe('summarizeAdbVersion', () => {
  it('keeps the two version lines and drops the install path and host', () => {
    const stdout = [
      'Android Debug Bridge version 1.0.41',
      'Version 36.0.0-13206524',
      'Installed as /Users/ana/Library/Android/sdk/platform-tools/adb',
      'Running on Darwin 25.0.0 (arm64)',
    ].join('\n');

    expect(summarizeAdbVersion(stdout)).toBe(
      'Android Debug Bridge version 1.0.41, Version 36.0.0-13206524',
    );
  });
});

describe('buildDiagnosticReport', () => {
  it('lists versions, adb, devices, repeated events and the log', () => {
    expect(buildDiagnosticReport(input())).toBe(
      [
        'Masaya diagnostic report',
        'Generated: 2026-10-22T17:00:00.000Z',
        'Masaya 0.3.1 · Electron 42.1.0 · Chrome 138.0.1 · Node 22.1.0 · darwin 15.1 arm64',
        'Language: es',
        'adb: ~/Library/Android/sdk/platform-tools/adb',
        'adb version: Android Debug Bridge version 1.0.41, Version 36.0.0-13206524',
        '',
        'Devices:',
        '  - Galaxy S23 Ultra (SM_S918B) · R5CW1234 · device',
        '  - unknown model · emulator-5554 · offline',
        '',
        'Repeated events:',
        '  mirror: control rejected: touch.pointerX ×12',
        '',
        'Log (last 200 lines):',
        '2026-10-22T16:59:00.000Z INFO  [mirror] started R5CW1234',
      ].join('\n'),
    );
  });

  it('says what is missing instead of leaving sections blank', () => {
    const report = buildDiagnosticReport(
      input({
        adbPath: null,
        adbVersion: err('adb not found'),
        devices: err('adb not found'),
        eventCounts: [],
        logLines: [],
      }),
    );

    expect(report).toContain('adb: not found');
    expect(report).toContain('adb version: unknown (adb not found)');
    expect(report).toContain('Devices:\n  could not list devices: adb not found');
    expect(report).toContain('Repeated events:\n  none');
    expect(report).toContain('Log (last 200 lines):\n  empty');
  });

  it('shows a model without a friendly name as is', () => {
    const report = buildDiagnosticReport(
      input({ devices: ok([{ id: 'abc', status: 'unauthorized', model: 'Pixel_8' }]) }),
    );

    expect(report).toContain('  - Pixel_8 · abc · unauthorized');
  });
});
