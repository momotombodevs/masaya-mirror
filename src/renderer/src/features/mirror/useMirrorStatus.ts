import { useCallback, useEffect, useState } from 'react';
import { getManoloApi } from '../../shared/manolo-api';

export type MirrorStatus = {
  readonly activeDeviceIds: readonly string[];
  readonly refreshStatus: () => Promise<void>;
};

/** Polls the main process for the set of devices that currently have an active mirror. */
export function useMirrorStatus(): MirrorStatus {
  const [activeDeviceIds, setActiveDeviceIds] = useState<readonly string[]>([]);

  const refreshStatus = useCallback(async (): Promise<void> => {
    const api = getManoloApi();
    if (!api) {
      return;
    }
    const result = await api.getMirrorStatus();
    if (result.ok) {
      setActiveDeviceIds(result.value.activeDeviceIds);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  return { activeDeviceIds, refreshStatus };
}
