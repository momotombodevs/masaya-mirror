import { describe, expect, it } from 'vitest';
import { friendlyModelName, parseDeviceName } from '../device-name';

describe('friendlyModelName', () => {
  it('maps Samsung codes in any region and in adb spelling', () => {
    expect(friendlyModelName('SM-S918B')).toBe('Galaxy S23 Ultra');
    expect(friendlyModelName('SM-S918U1')).toBe('Galaxy S23 Ultra');
    expect(friendlyModelName('SM_S918B')).toBe('Galaxy S23 Ultra');
    expect(friendlyModelName('SM-F946B')).toBe('Galaxy Z Fold5');
  });

  it('leaves unknown models alone', () => {
    expect(friendlyModelName('SM-X999B')).toBe('SM-X999B');
    expect(friendlyModelName('Pixel 8 Pro')).toBe('Pixel 8 Pro');
  });
});

describe('parseDeviceName', () => {
  it('takes the first property that has a value', () => {
    const stdout = [
      'ro.product.marketname=',
      'ro.product.vendor.marketname=Redmi Note 12',
      'ro.product.model=23021RAAEG',
    ].join('\n');

    expect(parseDeviceName(stdout)).toBe('Redmi Note 12');
  });

  it('falls back to the model, mapped when it is a Samsung code', () => {
    expect(parseDeviceName('ro.product.marketname=\nro.product.model=SM-S918B\n')).toBe(
      'Galaxy S23 Ultra',
    );
  });

  it('returns nothing when no property is set or the output is noise', () => {
    expect(parseDeviceName('ro.product.marketname=\nro.product.model=\n')).toBeUndefined();
    expect(parseDeviceName('/system/bin/sh: getprop: not found')).toBeUndefined();
  });
});
