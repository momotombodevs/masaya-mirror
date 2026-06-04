import { useCallback, useState } from 'react';
import {
  DEFAULT_MIRROR_OPTIONS,
  type MirrorOptions,
} from '../../../../shared/mirror/types';
import { getManoloApi } from '../../shared/manolo-api';
import { useMirrorStatus } from './useMirrorStatus';
import { disposeMirrorStreamClient } from './mirror-stream.client';

export type UseMirrorResult = {
  readonly activeDeviceIds: readonly string[];
  readonly isMirrorActive: boolean;
  readonly loading: boolean;
  readonly error: string | null;
  readonly options: MirrorOptions;
  readonly openMirror: (targetDeviceId?: string) => Promise<boolean>;
  readonly closeMirror: () => Promise<boolean>;
  readonly applyOptions: (nextOptions: MirrorOptions) => Promise<boolean>;
  readonly refreshStatus: () => Promise<void>;
};

export function useMirror(deviceId: string | null): UseMirrorResult {
  const { activeDeviceIds, refreshStatus } = useMirrorStatus();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<MirrorOptions>(DEFAULT_MIRROR_OPTIONS);

  const isMirrorActive = deviceId !== null && activeDeviceIds.includes(deviceId);

  const openMirror = useCallback(
    async (targetDeviceId?: string): Promise<boolean> => {
      const api = getManoloApi();
      if (!api) {
        setError('API de Manolo Mirror no disponible.');
        return false;
      }

      const id = targetDeviceId ?? deviceId;
      if (!id) {
        return false;
      }

      setLoading(true);
      setError(null);

      const result = await api.openMirror(id, options);
      setLoading(false);

      if (result.ok) {
        await refreshStatus();
        return true;
      }

      setError(result.error);
      return false;
    },
    [deviceId, options, refreshStatus],
  );

  const closeMirror = useCallback(async (): Promise<boolean> => {
    const api = getManoloApi();
    if (!api || !deviceId) {
      return false;
    }

    setLoading(true);
    setError(null);

    const result = await api.closeMirror(deviceId);
    setLoading(false);

    if (result.ok) {
      disposeMirrorStreamClient(deviceId);
      await refreshStatus();
      return true;
    }

    setError(result.error);
    return false;
  }, [deviceId, refreshStatus]);

  const applyOptions = useCallback(
    async (nextOptions: MirrorOptions): Promise<boolean> => {
      const api = getManoloApi();
      if (!api || !deviceId) {
        return false;
      }
      setOptions(nextOptions);
      setLoading(true);
      setError(null);

      const result = await api.setMirrorOptions(deviceId, nextOptions);
      setLoading(false);

      if (result.ok) {
        await refreshStatus();
        return true;
      }

      setError(result.error);
      return false;
    },
    [deviceId, refreshStatus],
  );

  return {
    activeDeviceIds,
    isMirrorActive,
    loading,
    error,
    options,
    openMirror,
    closeMirror,
    applyOptions,
    refreshStatus,
  };
}
