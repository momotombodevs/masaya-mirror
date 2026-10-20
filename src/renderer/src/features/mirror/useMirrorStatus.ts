import { useCallback, useEffect, useState } from 'react';
import { callApi } from '../../shared/manolo-api';

export type MirrorStatus = {
  readonly activeDeviceIds: readonly string[];
  readonly refreshStatus: () => Promise<void>;
};

/**
 * Reads the set of devices that currently have an active mirror, once on mount and again on
 * every `refreshStatus`. It does not poll: windows that need a live view call `refreshStatus`
 * on a timer or on focus (see `useAutoRefresh`).
 */
export function useMirrorStatus(): MirrorStatus {
  const [activeDeviceIds, setActiveDeviceIds] = useState<readonly string[]>([]);

  const refreshStatus = useCallback(async (): Promise<void> => {
    const result = await callApi((api) => api.getMirrorStatus(), '');
    if (result.ok) {
      setActiveDeviceIds(result.value.activeDeviceIds);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  return { activeDeviceIds, refreshStatus };
}
