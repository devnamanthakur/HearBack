import type mongoose from "mongoose";
import ModerationLogModel from "@/model/ModerationLog";

export interface ModerationLogInput {
  communityId: mongoose.Types.ObjectId;
  actorId?: mongoose.Types.ObjectId | string;
  action: string;
  targetType:
    | "topic"
    | "response"
    | "member"
    | "community"
    | "report"
    | "ai";
  targetId?: string;
  targetUserId?: mongoose.Types.ObjectId | string;
  detail?: string;
}

export async function logModeration(entry: ModerationLogInput): Promise<void> {
  try {
    await ModerationLogModel.create({
      communityId: entry.communityId,
      actorId: entry.actorId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      targetUserId: entry.targetUserId,
      detail: entry.detail,
    });
  } catch (error) {
    console.error("Failed to write moderation log", error);
  }
}
