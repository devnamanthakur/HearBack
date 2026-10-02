import type { Community } from "@/model/Community";
import CommunityModel from "@/model/Community";
import { MODERATION_BLOCKED_MESSAGE, checkContent } from "@/lib/moderation";
import { aiModerationAvailable, moderateText } from "@/lib/ai";
import { consumeRateLimit } from "@/lib/rateLimit";
import { envNumber } from "@/lib/env";
import { getCachedVerdict, setCachedVerdict } from "@/lib/moderationCache";
import { logModeration } from "@/lib/moderationLog";
import { sameObjectId } from "@/helpers/communityUtils";

export const STRIKE_MUTE_THRESHOLD = envNumber("STRIKE_MUTE_THRESHOLD", 3, {
  min: 1,
});
const MUTE_DURATION_MS = 24 * 60 * 60 * 1000;

const AI_FLAGGED_MESSAGE =
  "Our moderation check flagged this as inappropriate. Please rewrite it respectfully.";

export function mutedRemainingMs(community: Community, userId: string): number {
  const member = community.members.find((m) => sameObjectId(m.userId, userId));
  if (!member?.mutedUntil) return 0;
  return Math.max(member.mutedUntil.getTime() - Date.now(), 0);
}

export function memberStrikes(community: Community, userId: string): number {
  return (
    community.members.find((m) => sameObjectId(m.userId, userId))?.strikes ?? 0
  );
}

export interface ContentPipelineResult {
  blocked: boolean;
  message?: string;
  needsReview: boolean;
  autoMuted: boolean;
  strikes: number;
}

export async function runContentPipeline(opts: {
  community: Community;
  userId: string;
  text: string;
}): Promise<ContentPipelineResult> {
  const { community, userId, text } = opts;
  const member = community.members.find((m) => sameObjectId(m.userId, userId));

  const block = async (message: string): Promise<ContentPipelineResult> => {
    if (!member) {
      return {
        blocked: true,
        message,
        needsReview: false,
        autoMuted: false,
        strikes: 0,
      };
    }

    // Bump the strike counter atomically. Saving the whole community document
    // would let two concurrent blocked posts overwrite each other's strike.
    const struck = await CommunityModel.findOneAndUpdate(
      { _id: community._id, "members.userId": member.userId },
      { $inc: { "members.$.strikes": 1 } },
      { returnDocument: "after" },
    );
    const updatedMember = struck?.members.find((m) =>
      sameObjectId(m.userId, userId),
    );
    const strikes = updatedMember?.strikes ?? 0;

    let autoMuted = false;
    if (strikes >= STRIKE_MUTE_THRESHOLD) {
      const mutedUntil = updatedMember?.mutedUntil?.getTime() ?? 0;
      // Only start a fresh 24h mute; never extend one already in effect.
      if (mutedUntil <= Date.now()) {
        await CommunityModel.updateOne(
          { _id: community._id, "members.userId": member.userId },
          {
            $set: {
              "members.$.mutedUntil": new Date(Date.now() + MUTE_DURATION_MS),
            },
          },
        );
      }
      autoMuted = true;
    }

    return {
      blocked: true,
      message: autoMuted
        ? `${message} You have also been muted for 24 hours.`
        : message,
      needsReview: false,
      autoMuted,
      strikes,
    };
  };

  const local = checkContent(text);
  if (!local.ok) {
    return block(local.message ?? MODERATION_BLOCKED_MESSAGE);
  }

  const allow = (needsReview: boolean): ContentPipelineResult => ({
    blocked: false,
    needsReview,
    autoMuted: false,
    strikes: member?.strikes ?? 0,
  });

  if (community.type !== "educational" || !community.aiModeration) {
    return allow(false);
  }

  // Dev-only switch to exercise the needs-review queue without a Gemini key.
  if (process.env.AI_MODERATION_FORCE_REVIEW === "true") {
    return allow(true);
  }

  if (!aiModerationAvailable()) {
    return allow(false);
  }

  const cached = await getCachedVerdict(text);
  if (cached !== undefined) {
    return cached ? block(AI_FLAGGED_MESSAGE) : allow(false);
  }

  const rpm = envNumber("AI_MODERATION_RPM", 8, { min: 1 });
  const budget = await consumeRateLimit("ai:moderation:global", rpm, 60_000);
  if (!budget.allowed) {
    await logModeration({
      communityId: community._id,
      action: "ai_moderation_skipped",
      targetType: "ai",
      detail: "Per-minute AI budget reached; content allowed for teacher review.",
    });
    return allow(true);
  }

  const result = await moderateText(text);
  if (!result.ok || typeof result.toxic !== "boolean") {
    await logModeration({
      communityId: community._id,
      action: "ai_moderation_unavailable",
      targetType: "ai",
      detail: result.reason ?? "AI moderation unavailable.",
    });
    return allow(true);
  }

  await setCachedVerdict(text, result.toxic);
  if (result.toxic) {
    return block(AI_FLAGGED_MESSAGE);
  }
  return allow(false);
}

export function checkPostingRate(
  userId: string,
  kind: "topic" | "response",
) {
  const limit = kind === "topic" ? 3 : 10;
  return consumeRateLimit(`post:${kind}:${userId}`, limit, 60 * 60 * 1000);
}
