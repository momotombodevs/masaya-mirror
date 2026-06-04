import { app, Menu, type MenuItemConstructorOptions } from 'electron';

const APP_NAME = 'Manolo Mirror';

/**
 * Reload and DevTools roles are only exposed in development builds; packaged
 * builds should not let users open DevTools or force a reload.
 */
function buildViewSubmenu(): MenuItemConstructorOptions[] {
  const devItems: MenuItemConstructorOptions[] = app.isPackaged
    ? []
    : [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
      ];

  return [
    ...devItems,
    { role: 'resetZoom' },
    { role: 'zoomIn' },
    { role: 'zoomOut' },
    { type: 'separator' },
    { role: 'togglefullscreen' },
  ];
}

function buildDarwinMenu(): MenuItemConstructorOptions[] {
  return [
    {
      label: APP_NAME,
      submenu: [
        { role: 'about', label: `About ${APP_NAME}` },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide', label: `Hide ${APP_NAME}` },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: `Quit ${APP_NAME}` },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: buildViewSubmenu(),
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }],
    },
  ];
}

function buildDefaultMenu(): MenuItemConstructorOptions[] {
  return [
    {
      label: 'File',
      submenu: [{ role: 'quit', label: `Exit ${APP_NAME}` }],
    },
    {
      label: 'View',
      submenu: buildViewSubmenu(),
    },
  ];
}

export function installApplicationMenu(): void {
  app.setName(APP_NAME);

  const template = process.platform === 'darwin' ? buildDarwinMenu() : buildDefaultMenu();
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
