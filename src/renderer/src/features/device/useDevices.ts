import { useCallback, useEffect, useState } from 'react';
import type { AndroidDevice } from '../../../../shared/device/types';
import { getManoloApi } from '../../shared/manolo-api';

type DevicesState = {
  readonly devices: readonly AndroidDevice[];
  readonly loading: boolean;
  readonly error: string | null;
};

type UseDevicesResult = DevicesState & {
  readonly refresh: (options?: { readonly silent?: boolean }) => Promise<void>;
};

const AUTO_REFRESH_MS = 5_000;

const initialState: DevicesState = {
  devices: [],
  loading: false,
  error: null,
};

export function useDevices(): UseDevicesResult {
  const [state, setState] = useState<DevicesState>(initialState);

  const refresh = useCallback(async ({ silent = false } = {}): Promise<void> => {
    if (!silent) {
      setState((prev) => ({ ...prev, loading: true }));
    }

    try {
      const api = getManoloApi();
      if (!api) {
        setState({
          devices: [],
          loading: false,
          error: 'No se pudo conectar con el proceso principal. Reinicia la app.',
        });
        return;
      }

      const result = await api.listDevices();

      if (result.ok) {
        setState({ devices: result.value, loading: false, error: null });
        return;
      }

      setState({ devices: [], loading: false, error: result.error });
    } catch {
      setState({
        devices: [],
        loading: false,
        error: 'Error inesperado al cargar los dispositivos.',
      });
    }
  }, []);

  useEffect(() => {
    void refresh();

    // Keep the list current when devices are plugged in or the window regains focus.
    const refreshIfVisible = (): void => {
      if (document.visibilityState === 'visible') {
        void refresh({ silent: true });
      }
    };
    const timer = window.setInterval(refreshIfVisible, AUTO_REFRESH_MS);
    window.addEventListener('focus', refreshIfVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshIfVisible);
    };
  }, [refresh]);

  return { ...state, refresh };
}
