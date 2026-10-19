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

  test('connects a phone over Wi-Fi and disconnects it again', async () => {
    const { window } = launched;
    await window.getByRole('button', { name: 'Conectar por Wi-Fi…' }).click();
    await window.getByText('Otras formas de conectar').click();

    await window.getByLabel('Dirección IP y puerto').fill('192.168.1.20:5555');
    await window.getByRole('button', { name: 'Conectar', exact: true }).click();

    await expect(window.getByRole('status')).toContainText('Conectado a 192.168.1.20:5555');
    await window.keyboard.press('Escape');
    await expect(window.getByText('Wifi_Fake')).toBeVisible();

    await window.getByRole('listitem').filter({ hasText: 'Wifi_Fake' }).hover();
    await window.getByRole('button', { name: 'Desconectar Wifi_Fake' }).click();
    await expect(window.getByText('Wifi_Fake')).toBeHidden();
  });

  test('rejects a malformed address before touching adb', async () => {
    const { window } = launched;
    await window.getByRole('button', { name: 'Conectar por Wi-Fi…' }).click();
    await window.getByText('Otras formas de conectar').click();

    await window.getByLabel('Dirección IP y puerto').fill('not-an-address');
    await window.getByRole('button', { name: 'Conectar', exact: true }).click();

    await expect(window.getByRole('alert')).toContainText('Dirección inválida');
  });

  test('pairs with the right code and reports a wrong one', async () => {
    const { window } = launched;
    await window.getByRole('button', { name: 'Conectar por Wi-Fi…' }).click();
    await window.getByText('Otras formas de conectar').click();
    await window.getByText('Vincular con código (sin QR)').click();
    await window.getByLabel('Dirección de vinculación').fill('192.168.1.20:37099');

    await window.getByLabel('Código de 6 dígitos').fill('000000');
    await window.getByRole('button', { name: 'Vincular' }).click();
    await expect(window.getByRole('alert')).toContainText('Wrong password');

    await window.getByLabel('Código de 6 dígitos').fill('123456');
    await window.getByRole('button', { name: 'Vincular' }).click();
    await expect(window.getByRole('status')).toContainText('Dispositivo vinculado');
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

  test('opens a mirror window with the device controls', async () => {
    const { app, window } = launched;
    const opened = app.waitForEvent('window');

    await window.getByRole('listitem').filter({ hasText: 'Pixel_Fake' }).dblclick();
    const mirror = await opened;
    await mirror.waitForLoadState('domcontentloaded');

    for (const name of ['Atrás', 'Inicio', 'Apps recientes', 'Subir volumen', 'Instalar APK']) {
      await expect(mirror.getByRole('button', { name })).toBeVisible();
    }
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
