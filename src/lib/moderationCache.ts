import { createHash } from "node:crypto";
import ModerationVerdictModel from "@/model/ModerationVerdict";

const TTL_MS = 24 * 60 * 60 * 1000;

function keyFor(text: string): string {
  return createHash("sha256")
    .update(text.normalize("NFKC").toLowerCase().trim())
    .digest("hex");
}

function isDuplicateKeyError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return code === 11000 || code === 11001;
}

/**
 * Look up a cached moderation verdict. Shared across every server instance via
 * MongoDB (the previous in-memory Map only covered a single process). Entries
 * past their expiry are ignored even before the TTL monitor removes them.
 */
export async function getCachedVerdict(
  text: string,
): Promise<boolean | undefined> {
  const hash = keyFor(text);
  const entry = await ModerationVerdictModel.findOne({
    hash,
    expiresAt: { $gt: new Date() },
  })
    .select("toxic")
    .lean();
  return entry ? entry.toxic : undefined;
}

/**
 * Store a moderation verdict, refreshing its 24h TTL. Only the hash + boolean
 * are persisted. A concurrent insert of the same hash is harmless and ignored.
 */
export async function setCachedVerdict(
  text: string,
  toxic: boolean,
): Promise<void> {
  const hash = keyFor(text);
  try {
    await ModerationVerdictModel.updateOne(
      { hash },
      {
        $set: { toxic, expiresAt: new Date(Date.now() + TTL_MS) },
      },
      { upsert: true },
    );
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      console.error("Failed to cache moderation verdict", error);
    }
  }
}
