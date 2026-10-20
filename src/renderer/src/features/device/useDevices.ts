import { useCallback, useEffect, useRef, useState } from 'react';
import type { ErrorCode } from '../../../../shared/ipc/result';
import type { AndroidDevice } from '../../../../shared/device/types';
import { useI18n } from '../../shared/i18n';
import { callApi } from '../../shared/manolo-api';
import { sameFields } from '../../shared/same-items';
import { useAutoRefresh } from '../../shared/useAutoRefresh';

type DevicesState = {
  readonly devices: readonly AndroidDevice[];
  readonly loading: boolean;
  readonly error: string | null;
  /** Set when the failure has a known cause the UI reacts to, such as adb being missing. */
  readonly errorCode: ErrorCode | null;
};

type UseDevicesResult = DevicesState & {
  readonly refresh: (options?: { readonly silent?: boolean }) => Promise<void>;
};

/** How often the device list (and the mirroring badges beside it) are re-read in the background. */
export const DEVICE_REFRESH_MS = 5_000;

const initialState: DevicesState = {
  devices: [],
  loading: false,
  error: null,
  errorCode: null,
};

export function useDevices(): UseDevicesResult {
  const { t } = useI18n();
  const tRef = useRef(t);
  tRef.current = t;
  const [state, setState] = useState<DevicesState>(initialState);
  /** Numbers each request; only the latest one may update the list. */
  const latestRequest = useRef(0);
  const inFlight = useRef(false);

  const refresh = useCallback(async ({ silent = false } = {}): Promise<void> => {
    // Background refreshes never pile up behind a slow adb call.
    if (silent && inFlight.current) {
      return;
    }
    const request = ++latestRequest.current;
    inFlight.current = true;
    if (!silent) {
      setState((prev) => ({ ...prev, loading: true }));
    }

    const result = await callApi((api) => api.listDevices(), tRef.current('devices.loadFailed'));

    // A newer request (or an unmount) took over while this one was waiting.
    if (request !== latestRequest.current) {
      return;
    }
    inFlight.current = false;

    if (result.ok) {
      setState((prev) => {
        // A poll that finds the same devices must keep the same state, so nothing re-renders.
        const unchanged =
          !prev.loading &&
          prev.error === null &&
          prev.errorCode === null &&
          prev.devices.length === result.value.length &&
          prev.devices.every((device, index) => {
            const next = result.value[index];
            return next !== undefined && sameFields(device, next);
          });
        return unchanged
          ? prev
          : { devices: result.value, loading: false, error: null, errorCode: null };
      });
    } else {
      // A failed background refresh must not blank a list the user is looking at.
      setState((prev) => ({
        devices: silent ? prev.devices : [],
        loading: false,
        error: result.error,
        errorCode: result.code ?? null,
      }));
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => {
      latestRequest.current += 1;
      inFlight.current = false;
    };
  }, [refresh]);

  // Keep the list current when devices are plugged in or the window regains focus.
  useAutoRefresh(() => void refresh({ silent: true }), DEVICE_REFRESH_MS);

  return { ...state, refresh };
}
