import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  nativeTheme: { shouldUseDarkColors: false, on: vi.fn(), off: vi.fn() },
  systemPreferences: { getAccentColor: vi.fn() },
}));

const { getWindowMaterial, isMicaSupported } = await import('../system-theme');

describe('isMicaSupported', () => {
  it('starts at Windows 11 22H2', () => {
    expect(isMicaSupported('10.0.22621')).toBe(true);
    expect(isMicaSupported('10.0.26100')).toBe(true);
    expect(isMicaSupported('10.0.22000')).toBe(false);
    expect(isMicaSupported('10.0.19045')).toBe(false);
  });
});

describe('getWindowMaterial', () => {
  it('uses vibrancy on macOS and Mica on Windows 11', () => {
    expect(getWindowMaterial('darwin', '24.0.0')).toEqual({ vibrancy: 'under-window' });
    expect(getWindowMaterial('win32', '10.0.22631')).toEqual({ backgroundMaterial: 'mica' });
  });

  it('draws no material on older Windows or Linux', () => {
    expect(getWindowMaterial('win32', '10.0.19045')).toBeNull();
    expect(getWindowMaterial('linux', '6.8.0')).toBeNull();
  });
});
