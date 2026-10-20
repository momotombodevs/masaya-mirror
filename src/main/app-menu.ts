import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron';
import type { Locale } from '../shared/i18n/locale';
import { createTranslator, type Translate } from '../shared/i18n/messages';
import { MENU_ACTION_CHANNEL, type MenuAction } from '../shared/ipc/menu.contract';

const APP_NAME = 'Manolo Mirror';

/** Sends a menu command to the focused window, which decides whether it applies. */
function sendToFocusedWindow(action: MenuAction): void {
  BrowserWindow.getFocusedWindow()?.webContents.send(MENU_ACTION_CHANNEL, action);
}

function menuItem(
  label: string,
  accelerator: string,
  action: MenuAction,
): MenuItemConstructorOptions {
  return { label, accelerator, click: () => sendToFocusedWindow(action) };
}

/** Developer-only entries; packaged builds must not expose DevTools or forced reloads. */
function buildDevItems(): MenuItemConstructorOptions[] {
  return app.isPackaged
    ? []
    : [{ role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' }];
}

function buildDeviceMenu(t: Translate): MenuItemConstructorOptions {
  return {
    label: t('menu.device'),
    submenu: [
      menuItem(t('menu.refresh'), 'CmdOrCtrl+R', 'refresh'),
      menuItem(t('menu.wifi'), 'CmdOrCtrl+Shift+W', 'wifi'),
      { type: 'separator' },
      menuItem(t('menu.capture'), 'CmdOrCtrl+Shift+4', 'capture'),
      menuItem(t('menu.record'), 'CmdOrCtrl+Shift+5', 'record'),
      { type: 'separator' },
      menuItem(t('menu.mirrorSettings'), 'CmdOrCtrl+,', 'settings'),
    ],
  };
}

function buildEditMenu(t: Translate): MenuItemConstructorOptions {
  return {
    label: t('menu.edit'),
    submenu: [
      { role: 'undo', label: t('menu.undo') },
      { role: 'redo', label: t('menu.redo') },
      { type: 'separator' },
      { role: 'cut', label: t('menu.cut') },
      { role: 'copy', label: t('menu.copy') },
      { role: 'paste', label: t('menu.paste') },
      { role: 'selectAll', label: t('menu.selectAll') },
    ],
  };
}

function buildViewMenu(t: Translate): MenuItemConstructorOptions {
  return {
    label: t('menu.view'),
    submenu: [
      ...buildDevItems(),
      { role: 'resetZoom', label: t('menu.actualSize') },
      { role: 'zoomIn', label: t('menu.zoomIn') },
      { role: 'zoomOut', label: t('menu.zoomOut') },
      { type: 'separator' },
      { role: 'togglefullscreen', label: t('menu.fullscreen') },
    ],
  };
}

/** The "Check for Updates" entry, only present in builds that can update themselves. */
function buildUpdateItems(
  t: Translate,
  onCheckForUpdates?: () => void,
): MenuItemConstructorOptions[] {
  return onCheckForUpdates
    ? [{ label: t('update.check'), click: onCheckForUpdates }, { type: 'separator' }]
    : [];
}

function buildDarwinMenu(
  t: Translate,
  onCheckForUpdates?: () => void,
): MenuItemConstructorOptions[] {
  return [
    {
      label: APP_NAME,
      submenu: [
        { role: 'about', label: t('menu.about', { app: APP_NAME }) },
        { type: 'separator' },
        ...buildUpdateItems(t, onCheckForUpdates),
        { role: 'services', label: t('menu.services') },
        { type: 'separator' },
        { role: 'hide', label: t('menu.hide', { app: APP_NAME }) },
        { role: 'hideOthers', label: t('menu.hideOthers') },
        { role: 'unhide', label: t('menu.unhide') },
        { type: 'separator' },
        { role: 'quit', label: t('menu.quit', { app: APP_NAME }) },
      ],
    },
    buildEditMenu(t),
    buildDeviceMenu(t),
    buildViewMenu(t),
    {
      label: t('menu.window'),
      submenu: [
        { role: 'minimize', label: t('menu.minimize') },
        { role: 'close', label: t('menu.close') },
        { type: 'separator' },
        { role: 'front', label: t('menu.front') },
      ],
    },
  ];
}

function buildDefaultMenu(
  t: Translate,
  onCheckForUpdates?: () => void,
): MenuItemConstructorOptions[] {
  return [
    {
      label: t('menu.file'),
      submenu: [
        ...buildUpdateItems(t, onCheckForUpdates),
        { role: 'close', label: t('menu.closeWindow') },
        { role: 'quit', label: t('menu.quit', { app: APP_NAME }) },
      ],
    },
    buildEditMenu(t),
    buildDeviceMenu(t),
    buildViewMenu(t),
  ];
}

export function installApplicationMenu(locale: Locale, onCheckForUpdates?: () => void): void {
  const t = createTranslator(locale);
  const template =
    process.platform === 'darwin'
      ? buildDarwinMenu(t, onCheckForUpdates)
      : buildDefaultMenu(t, onCheckForUpdates);
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
