/** Machine-readable failure reasons the renderer may branch on, instead of matching message text. */
export type ErrorCode = 'ADB_NOT_FOUND';

export type Result<T, E = string> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E; readonly code?: ErrorCode };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<E = string>(error: E, code?: ErrorCode): Result<never, E> {
  return code ? { ok: false, error, code } : { ok: false, error };
}

/** Transforms the value of a successful result; a failure passes through untouched. */
export function mapResult<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? { ok: true, value: fn(result.value) } : result;
}
