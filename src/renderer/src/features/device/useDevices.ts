import { useCallback, useEffect, useState } from 'react';
import type { AndroidDevice } from '../../../../shared/device/types';

type DevicesState = {
  readonly devices: readonly AndroidDevice[];
  readonly loading: boolean;
  readonly error: string | null;
};

const initialState: DevicesState = {
  devices: [],
  loading: false,
  error: null,
};

export function useDevices() {
  const [state, setState] = useState<DevicesState>(initialState);

  const refresh = useCallback(async (): Promise<void> => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      if (!window.manolo?.listDevices) {
        setState({
          devices: [],
          loading: false,
          error:
            'No se pudo conectar con el proceso principal. Reinicia la aplicación.',
        });
        return;
      }

      const result = await window.manolo.listDevices();

      if (result.ok) {
        setState({ devices: result.value, loading: false, error: null });
        return;
      }

      setState({ devices: [], loading: false, error: result.error });
    } catch {
      setState({
        devices: [],
        loading: false,
        error: 'Error inesperado al buscar dispositivos.',
      });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...state, refresh };
}
