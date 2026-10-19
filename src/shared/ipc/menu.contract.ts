/** Channel the main process uses to forward application menu commands to a window. */
export const MENU_ACTION_CHANNEL = 'manolo:menu-action';

export const MENU_ACTIONS = ['refresh', 'capture', 'record', 'wifi'] as const;

export type MenuAction = (typeof MENU_ACTIONS)[number];

export function isMenuAction(value: unknown): value is MenuAction {
  return MENU_ACTIONS.some((action) => action === value);
}
