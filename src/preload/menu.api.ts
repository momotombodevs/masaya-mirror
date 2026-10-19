import { ipcRenderer } from 'electron';
import { MENU_ACTION_CHANNEL, isMenuAction, type MenuAction } from '../shared/ipc/menu.contract';

export const menuApi = {
  /** Subscribes to application menu commands. Returns an unsubscribe function. */
  onMenuAction: (listener: (action: MenuAction) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, action: unknown): void => {
      if (isMenuAction(action)) {
        listener(action);
      }
    };
    ipcRenderer.on(MENU_ACTION_CHANNEL, handler);
    return () => ipcRenderer.removeListener(MENU_ACTION_CHANNEL, handler);
  },
};
