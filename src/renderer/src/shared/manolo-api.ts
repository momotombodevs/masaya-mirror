import { err, type Result } from '../../../shared/ipc/result';

export type ManoloApi = Window['manolo'];

/** Returns the preload-exposed API, or undefined when the bridge is unavailable. */
export function getManoloApi(): ManoloApi | undefined {
  return (window as { manolo?: ManoloApi }).manolo;
}

/**
 * Runs one bridge call and always answers with a Result: a missing bridge or a rejected
 * call becomes `err(fallbackMessage)` instead of throwing, so callers only branch on `ok`.
 */
export async function callApi<T>(
  call: (api: ManoloApi) => Promise<Result<T>>,
  fallbackMessage: string,
): Promise<Result<T>> {
  const api = getManoloApi();
  if (!api) {
    return err(fallbackMessage);
  }
  try {
    return await call(api);
  } catch {
    return err(fallbackMessage);
  }
}
