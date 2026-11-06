import { err, type Result } from '../../../shared/ipc/result';
import { createTauriApi, isTauri } from './tauri/tauri-api';

export type MasayaApi = Window['masaya'];

let tauriApi: MasayaApi | undefined;

/**
 * Returns the API of the backend this window runs on: the one the Electron preload exposes, or
 * the Tauri commands. Undefined when neither is there (a plain browser).
 */
export function getMasayaApi(): MasayaApi | undefined {
  const preloaded = (window as { masaya?: MasayaApi }).masaya;
  if (preloaded) {
    return preloaded;
  }
  if (isTauri()) {
    tauriApi ??= createTauriApi();
    return tauriApi;
  }
  return undefined;
}

/**
 * Runs one bridge call and always answers with a Result: a missing bridge or a rejected
 * call becomes `err(fallbackMessage)` instead of throwing, so callers only branch on `ok`.
 */
export async function callApi<T>(
  call: (api: MasayaApi) => Promise<Result<T>>,
  fallbackMessage: string,
): Promise<Result<T>> {
  const api = getMasayaApi();
  if (!api) {
    return err(fallbackMessage);
  }
  try {
    return await call(api);
  } catch {
    return err(fallbackMessage);
  }
}
