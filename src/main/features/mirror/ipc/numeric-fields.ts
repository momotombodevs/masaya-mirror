import { err, ok, type Result } from '../../../../shared/ipc/result';

type NumericRule = {
  readonly min?: number;
  readonly max: number;
  /** Used when the field is absent. Fields without a default are required. */
  readonly fallback?: number;
  /** Keep fractional values (pressure, scroll deltas). Integers are rounded by default. */
  readonly fractional?: boolean;
};

export type NumericRules = Readonly<Record<string, NumericRule>>;

export type ParsedFields<R extends NumericRules> = { readonly [K in keyof R]: number };

function readNumber(value: unknown, rule: NumericRule): number | null {
  if (value === undefined) {
    return rule.fallback ?? null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  if (value < (rule.min ?? 0) || value > rule.max) {
    return null;
  }
  return rule.fractional ? value : Math.round(value);
}

/** Reads every field named in `rules` from `raw`, failing with `error` on the first invalid one. */
export function parseNumericFields<R extends NumericRules>(
  raw: Readonly<Record<string, unknown>>,
  rules: R,
  error: string,
): Result<ParsedFields<R>> {
  const parsed: Record<string, number> = {};
  for (const [field, rule] of Object.entries(rules)) {
    const value = readNumber(raw[field], rule);
    if (value === null) {
      return err(error);
    }
    parsed[field] = value;
  }
  return ok(parsed as ParsedFields<R>);
}

/** The first field `parseNumericFields` would reject, for logging which one a sender gets wrong. */
export function findInvalidField(
  raw: Readonly<Record<string, unknown>>,
  rules: NumericRules,
): string | null {
  return (
    Object.entries(rules).find(([field, rule]) => readNumber(raw[field], rule) === null)?.[0] ??
    null
  );
}
