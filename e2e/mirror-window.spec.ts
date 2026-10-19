import { expect, test, type Page } from '@playwright/test';
import { FAKE_ADB, launchApp, type Launched } from './app';

let launched: Launched;

test.beforeEach(async () => {
  launched = await launchApp({ adbPath: FAKE_ADB });
});

test.afterEach(async () => {
  await launched.app.close();
});

async function openMirrorWindow(): Promise<Page> {
  const { app, window } = launched;
  const opened = app.waitForEvent('window');
  await window.getByRole('listitem').filter({ hasText: 'Pixel_Fake' }).dblclick();
  const mirror = await opened;
  await mirror.waitForLoadState('domcontentloaded');
  return mirror;
}

async function openSettings(mirror: Page): Promise<void> {
  await mirror.getByRole('button', { name: 'Más opciones' }).click();
  await mirror.getByRole('menuitem', { name: 'Ajustes…' }).click();
  await expect(mirror.getByRole('dialog', { name: 'Ajustes' })).toBeVisible();
}

test('shows the toolbar actions and the navigation bar', async () => {
  const mirror = await openMirrorWindow();

  for (const name of ['Captura', 'Grabar', 'Pantalla completa', 'Más opciones']) {
    await expect(mirror.getByRole('button', { name })).toBeVisible();
  }
  const navigation = mirror.getByRole('navigation', { name: 'Navegación del dispositivo' });
  for (const name of ['Atrás', 'Inicio', 'Apps recientes']) {
    await expect(navigation.getByRole('button', { name })).toBeVisible();
  }
});

test('keeps volume, power, APK install and settings in the options menu', async () => {
  const mirror = await openMirrorWindow();

  await mirror.getByRole('button', { name: 'Más opciones' }).click();

  for (const name of [
    'Subir volumen',
    'Bajar volumen',
    'Encender o apagar pantalla',
    'Instalar APK…',
    'Ajustes…',
  ]) {
    await expect(mirror.getByRole('menuitem', { name })).toBeVisible();
  }
});

test('settings screen has window, image and device sections', async () => {
  const mirror = await openMirrorWindow();

  await openSettings(mirror);

  for (const title of ['Ventana', 'Calidad de imagen', 'Dispositivo']) {
    await expect(mirror.getByRole('heading', { name: title })).toBeVisible();
  }
  await mirror.getByRole('button', { name: 'Cerrar' }).click();
  await expect(mirror.getByRole('dialog', { name: 'Ajustes' })).toBeHidden();
});

test('hides the navigation bar from settings and remembers it in the next window', async () => {
  const mirror = await openMirrorWindow();
  await openSettings(mirror);

  await mirror.getByRole('switch', { name: 'Barra de navegación' }).click();
  await expect(mirror.getByRole('navigation', { name: 'Navegación del dispositivo' })).toBeHidden();
  await mirror.close();

  const again = await openMirrorWindow();
  await expect(again.getByRole('button', { name: 'Más opciones' })).toBeVisible();
  await expect(again.getByRole('navigation', { name: 'Navegación del dispositivo' })).toBeHidden();
});

test('turns on show touches on the phone', async () => {
  const mirror = await openMirrorWindow();
  await openSettings(mirror);
  const touches = mirror.getByRole('switch', { name: 'Mostrar toques' });
  await expect(touches).toBeEnabled();
  await expect(touches).toHaveAttribute('aria-checked', 'false');

  await touches.click();

  await expect(touches).toHaveAttribute('aria-checked', 'true');
});
