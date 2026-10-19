import { existsSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FAKE_ADB, launchApp, type Launched } from './app';

let launched: Launched;

test.afterEach(async () => {
  await launched?.app.close();
});

test.describe('with adb available', () => {
  test.beforeEach(async () => {
    launched = await launchApp({ adbPath: FAKE_ADB });
  });

  test('lists the connected phone', async () => {
    await expect(launched.window.getByText('Pixel_Fake')).toBeVisible();
  });

  test('shows a QR code and waits for the phone, and stops when cancelled', async () => {
    const { window } = launched;
    await window.getByRole('button', { name: 'Conectar por Wi-Fi…' }).click();

    await window.getByRole('button', { name: 'Mostrar código QR' }).click();

    await expect(
      window.getByRole('img', { name: 'Código QR para vincular el teléfono' }),
    ).toBeVisible();
    await expect(window.getByText('Esperando al teléfono…')).toBeVisible();

    await window.getByRole('button', { name: 'Cancelar' }).click();
    await expect(window.getByRole('button', { name: 'Mostrar código QR' })).toBeVisible();
  });
});

test.describe('without adb', () => {
  test.skip(existsSync('/usr/bin/adb') || existsSync('/bin/adb'), 'a system adb is installed');

  test('guides the user to install or choose adb', async () => {
    launched = await launchApp({ adbPath: '/nonexistent/adb' });
    const { window } = launched;

    await expect(window.getByText('Falta adb')).toBeVisible();
    await expect(window.getByRole('button', { name: 'Descargar platform-tools' })).toBeVisible();
    await expect(window.getByRole('button', { name: 'Elegir adb…' })).toBeVisible();
  });
});
