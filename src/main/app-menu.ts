import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron';
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

function buildDeviceMenu(): MenuItemConstructorOptions {
  return {
    label: 'Dispositivo',
    submenu: [
      menuItem('Actualizar lista', 'CmdOrCtrl+R', 'refresh'),
      menuItem('Conectar por Wi-Fi…', 'CmdOrCtrl+Shift+W', 'wifi'),
      { type: 'separator' },
      menuItem('Captura de pantalla', 'CmdOrCtrl+Shift+4', 'capture'),
      menuItem('Grabar', 'CmdOrCtrl+Shift+5', 'record'),
      { type: 'separator' },
      menuItem('Ajustes del espejo…', 'CmdOrCtrl+,', 'settings'),
    ],
  };
}

function buildViewMenu(): MenuItemConstructorOptions {
  return {
    label: 'Ver',
    submenu: [
      ...buildDevItems(),
      { role: 'resetZoom', label: 'Tamaño real' },
      { role: 'zoomIn', label: 'Acercar' },
      { role: 'zoomOut', label: 'Alejar' },
      { type: 'separator' },
      { role: 'togglefullscreen', label: 'Pantalla completa' },
    ],
  };
}

function buildDarwinMenu(): MenuItemConstructorOptions[] {
  return [
    {
      label: APP_NAME,
      submenu: [
        { role: 'about', label: `Acerca de ${APP_NAME}` },
        { type: 'separator' },
        { role: 'services', label: 'Servicios' },
        { type: 'separator' },
        { role: 'hide', label: `Ocultar ${APP_NAME}` },
        { role: 'hideOthers', label: 'Ocultar otros' },
        { role: 'unhide', label: 'Mostrar todo' },
        { type: 'separator' },
        { role: 'quit', label: `Salir de ${APP_NAME}` },
      ],
    },
    {
      label: 'Edición',
      submenu: [
        { role: 'undo', label: 'Deshacer' },
        { role: 'redo', label: 'Rehacer' },
        { type: 'separator' },
        { role: 'cut', label: 'Cortar' },
        { role: 'copy', label: 'Copiar' },
        { role: 'paste', label: 'Pegar' },
        { role: 'selectAll', label: 'Seleccionar todo' },
      ],
    },
    buildDeviceMenu(),
    buildViewMenu(),
    {
      label: 'Ventana',
      submenu: [
        { role: 'minimize', label: 'Minimizar' },
        { role: 'close', label: 'Cerrar' },
        { type: 'separator' },
        { role: 'front', label: 'Traer todo al frente' },
      ],
    },
  ];
}

function buildDefaultMenu(): MenuItemConstructorOptions[] {
  return [
    {
      label: 'Archivo',
      submenu: [
        { role: 'close', label: 'Cerrar ventana' },
        { role: 'quit', label: `Salir de ${APP_NAME}` },
      ],
    },
    buildDeviceMenu(),
    buildViewMenu(),
  ];
}

export function installApplicationMenu(): void {
  app.setName(APP_NAME);

  const template = process.platform === 'darwin' ? buildDarwinMenu() : buildDefaultMenu();
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
