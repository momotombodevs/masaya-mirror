import { useCallback, useRef, useState } from 'react';
import { DEFAULT_MIRROR_OPTIONS, type MirrorOptions } from '../../../../shared/mirror/types';
import { useI18n } from '../../shared/i18n';
import { callApi, type MasayaApi } from '../../shared/masaya-api';
import type { Result } from '../../../../shared/ipc/result';
import { useMirrorStatus } from './useMirrorStatus';
import { disposeMirrorStreamClient } from './mirror-stream.client';

export type UseMirrorResult = {
  readonly activeDeviceIds: readonly string[];
  readonly isMirrorActive: boolean;
  readonly loading: boolean;
  readonly error: string | null;
  readonly options: MirrorOptions;
  readonly openMirror: (targetDeviceId?: string, startOptions?: MirrorOptions) => Promise<boolean>;
  readonly closeMirror: () => Promise<boolean>;
  readonly applyOptions: (nextOptions: MirrorOptions) => Promise<boolean>;
  readonly refreshStatus: () => Promise<void>;
};

export function useMirror(deviceId: string | null): UseMirrorResult {
  const { t } = useI18n();
  const tRef = useRef(t);
  tRef.current = t;
  const { activeDeviceIds, refreshStatus } = useMirrorStatus();
  // A counter, not a flag: one operation finishing must not clear another that is still running.
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<MirrorOptions>(DEFAULT_MIRROR_OPTIONS);

  const isMirrorActive = deviceId !== null && activeDeviceIds.includes(deviceId);

  /**
   * Runs one start/restart/close call: owns the loading counter and the error, and re-reads the
   * mirror status after a success. Resolves true when the call succeeded.
   */
  const run = useCallback(
    async <T>(
      call: (api: MasayaApi) => Promise<Result<T>>,
      onSuccess: () => void,
    ): Promise<boolean> => {
      setPending((count) => count + 1);
      setError(null);
      let result: Result<T>;
      try {
        result = await callApi(call, tRef.current('mirror.apiUnavailable'));
      } finally {
        setPending((count) => count - 1);
      }

      if (!result.ok) {
        setError(result.error);
        return false;
      }
      onSuccess();
      await refreshStatus();
      return true;
    },
    [refreshStatus],
  );

  const openMirror = useCallback(
    async (targetDeviceId?: string, startOptions?: MirrorOptions): Promise<boolean> => {
      const id = targetDeviceId ?? deviceId;
      if (!id) {
        return false;
      }
      const openWith = startOptions ?? options;
      return run(
        (api) => api.openMirror(id, openWith),
        () => setOptions(openWith),
      );
    },
    [deviceId, options, run],
  );

  const closeMirror = useCallback(async (): Promise<boolean> => {
    if (!deviceId) {
      return false;
    }
    return run(
      (api) => api.closeMirror(deviceId),
      () => disposeMirrorStreamClient(deviceId),
    );
  }, [deviceId, run]);

  const applyOptions = useCallback(
    async (nextOptions: MirrorOptions): Promise<boolean> => {
      if (!deviceId) {
        return false;
      }
      return run(
        (api) => api.setMirrorOptions(deviceId, nextOptions),
        () => setOptions(nextOptions),
      );
    },
    [deviceId, run],
  );

  return {
    activeDeviceIds,
    isMirrorActive,
    loading: pending > 0,
    error,
    options,
    openMirror,
    closeMirror,
    applyOptions,
    refreshStatus,
  };
}
