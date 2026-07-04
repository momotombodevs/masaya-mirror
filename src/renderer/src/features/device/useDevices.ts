import { useCallback, useEffect, useState } from 'react';
import type { AndroidDevice } from '../../../../shared/device/types';
import { getManoloApi } from '../../shared/manolo-api';

type DevicesState = {
  readonly devices: readonly AndroidDevice[];
  readonly loading: boolean;
  readonly error: string | null;
};

export type UseDevicesResult = DevicesState & {
  readonly refresh: () => Promise<void>;
};

const initialState: DevicesState = {
  devices: [],
  loading: false,
  error: null,
};

export function useDevices(): UseDevicesResult {
  const [state, setState] = useState<DevicesState>(initialState);

  const refresh = useCallback(async (): Promise<void> => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const api = getManoloApi();
      if (!api) {
        setState({
          devices: [],
          loading: false,
          error: 'Unable to connect to the main process. Restart the app.',
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
        error: 'Unexpected error while loading devices.',
      });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...state, refresh };
}
