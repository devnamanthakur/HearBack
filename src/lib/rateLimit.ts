import RateLimitModel from "@/model/RateLimit";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

function isDuplicateKeyError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return code === 11000 || code === 11001;
}

/**
 * Fixed-window rate limiter backed by a single atomic MongoDB update.
 *
 * The window resets at the first request that finds an expired/missing record,
 * and every caller increments the counter before being told whether it is over
 * the limit. This closes the read-then-write race the previous implementation
 * had, so a burst of parallel requests can no longer slip past the limit.
 */
export async function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = new Date();

  // 1. Atomically reset an expired window. Only one concurrent caller wins.
  const reset = await RateLimitModel.findOneAndUpdate(
    { key, expiresAt: { $lte: now } },
    { $set: { count: 1, expiresAt: new Date(now.getTime() + windowMs) } },
    { returnDocument: "after" },
  );
  if (reset) {
    return {
      allowed: true,
      remaining: Math.max(limit - 1, 0),
      retryAfterMs: 0,
    };
  }

  // 2. Increment first, create the window if it does not exist yet.
  let count = 1;
  let expiresAt = new Date(now.getTime() + windowMs);
  try {
    const doc = await RateLimitModel.findOneAndUpdate(
      { key },
      {
        $inc: { count: 1 },
        $setOnInsert: { expiresAt: new Date(now.getTime() + windowMs) },
      },
      { upsert: true, returnDocument: "after" },
    );
    count = doc?.count ?? 1;
    expiresAt = doc?.expiresAt ?? expiresAt;
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    // Another caller inserted the same key between our find and upsert.
    // Retry once without upsert now that the document exists.
    const doc = await RateLimitModel.findOneAndUpdate(
      { key },
      { $inc: { count: 1 } },
      { returnDocument: "after" },
    );
    count = doc?.count ?? 1;
    expiresAt = doc?.expiresAt ?? expiresAt;
  }

  if (count > limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(expiresAt.getTime() - now.getTime(), 0),
    };
  }
  return {
    allowed: true,
    remaining: Math.max(limit - count, 0),
    retryAfterMs: 0,
  };
}

export function formatRetryAfter(ms: number): string {
  const seconds = Math.max(Math.ceil(ms / 1000), 1);
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}
