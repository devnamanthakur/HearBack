const warned = new Set<string>();

/**
 * Read a positive numeric environment variable, falling back to a safe default
 * when it is missing, non-numeric, or out of range. A misconfigured value must
 * never silently disable a safety limit (e.g. `Number("abc")` -> NaN), so we
 * warn once and use the default instead.
 */
export function envNumber(
  name: string,
  fallback: number,
  opts: { min?: number; max?: number } = {},
): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;

  const value = Number(raw);
  const min = opts.min ?? Number.MIN_SAFE_INTEGER;
  const max = opts.max ?? Number.MAX_SAFE_INTEGER;

  if (!Number.isFinite(value) || value <= 0 || value < min || value > max) {
    if (!warned.has(name)) {
      warned.add(name);
      console.warn(
        `[env] Ignoring invalid ${name}=${JSON.stringify(raw)}; using default ${fallback}.`,
      );
    }
    return fallback;
  }
  return value;
}
