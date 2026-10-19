import { useEffect, useRef } from 'react';
import type { MenuAction } from '../../../shared/ipc/menu.contract';
import { getManoloApi } from './manolo-api';

type MenuHandlers = Partial<Record<MenuAction, () => void>>;

/** Runs the matching handler when the application menu sends a command to this window. */
export function useMenuActions(handlers: MenuHandlers): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    return getManoloApi()?.onMenuAction((action) => handlersRef.current[action]?.());
  }, []);
}
