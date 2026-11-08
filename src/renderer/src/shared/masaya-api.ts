import { err, type Result } from '../../../shared/ipc/result';

export type MasayaApi = Window['masaya'];

/** Returns the preload-exposed API, or undefined when the bridge is unavailable. */
export function getMasayaApi(): MasayaApi | undefined {
  return (window as { masaya?: MasayaApi }).masaya;
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
