// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ConnectionChip } from '../ConnectionChip';
import { deviceTone } from '../device.ui';

describe('ConnectionChip', () => {
  afterEach(cleanup);

  it.each([
    ['38211FDJH00XYZ', 'USB'],
    ['192.168.1.42:5555', 'Wi-Fi'],
    ['emulator-5554', 'Emulador'],
  ])('labels %s as %s', (deviceId, label) => {
    render(<ConnectionChip deviceId={deviceId} />);
    expect(screen.getByText(label)).toBeTruthy();
  });
});

describe('deviceTone', () => {
  it('gives the same device the same color every time', () => {
    expect(deviceTone('38211FDJH00XYZ')).toBe(deviceTone('38211FDJH00XYZ'));
  });

  it('spreads devices over several colors', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((x) => `${x}1234567`);
    expect(new Set(ids.map(deviceTone)).size).toBeGreaterThan(1);
  });
});
