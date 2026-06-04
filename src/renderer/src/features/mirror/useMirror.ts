import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_MIRROR_OPTIONS,
  type MirrorOptions,
} from '../../../../shared/mirror/types';
import type { MirrorVideoMetadata } from '../../../../shared/mirror/types';
import { disposeMirrorStreamClient } from './mirror-stream.client';

function getManoloApi(): Window['manolo'] | undefined {
  return typeof window !== 'undefined' ? window.manolo : undefined;
}

export function useMirror(deviceId: string | null) {
  const [activeDeviceIds, setActiveDeviceIds] = useState<readonly string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<MirrorVideoMetadata | null>(null);
  const [options, setOptions] = useState<MirrorOptions>(DEFAULT_MIRROR_OPTIONS);

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

  const isMirrorActive = deviceId !== null && activeDeviceIds.includes(deviceId);

  const openMirror = useCallback(async (targetDeviceId?: string): Promise<boolean> => {
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
      setMetadata(result.value.metadata);
      await refreshStatus();
      return true;
    }

    setError(result.error);
    return false;
  }, [deviceId, options, refreshStatus]);

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
      setMetadata(null);
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
        setMetadata(result.value.metadata);
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
    metadata,
    options,
    setOptions,
    openMirror,
    closeMirror,
    applyOptions,
    refreshStatus,
  };
}
