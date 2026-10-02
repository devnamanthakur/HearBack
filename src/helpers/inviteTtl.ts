export const INVITE_TTL_OPTIONS = [
  { label: "24 hours", hours: 24 },
  { label: "7 days", hours: 24 * 7 },
  { label: "30 days", hours: 24 * 30 },
  { label: "Never", hours: null },
] as const;

export const DEFAULT_INVITE_TTL_HOURS = 24 * 7;

export const MAX_INVITE_TTL_HOURS = 24 * 365;

export type InviteTtlResolution =
  | { ok: true; keep: true }
  | { ok: true; keep: false; hours: number | null }
  | { ok: false };

/**
 * Validate an admin-supplied invite TTL.
 * - `undefined`  -> keep the current expiry (nothing to change)
 * - `null`       -> never expires
 * - positive int -> expires after that many hours
 * Anything else is rejected so a malformed value can never silently produce a
 * code that never expires.
 */
export function resolveInviteTtl(raw: unknown): InviteTtlResolution {
  if (raw === undefined) return { ok: true, keep: true };
  if (raw === null) return { ok: true, keep: false, hours: null };
  if (
    typeof raw === "number" &&
    Number.isInteger(raw) &&
    raw > 0 &&
    raw <= MAX_INVITE_TTL_HOURS
  ) {
    return { ok: true, keep: false, hours: raw };
  }
  return { ok: false };
}

/**
 * Convert an invite TTL in hours to an absolute expiry date.
 * `null` means "never expires"; anything invalid also yields no expiry.
 */
export function inviteExpiryFromHours(hours: unknown): Date | undefined {
  if (hours === null) return undefined;
  if (typeof hours !== "number" || !Number.isFinite(hours) || hours <= 0) {
    return undefined;
  }
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}
