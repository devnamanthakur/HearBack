import dbConnect from "@/lib/dbConnect";
import CommunityModel from "@/model/Community";
import BanAppealModel from "@/model/BanAppeal";
import UserModel from "@/model/User";
import { auth } from "@/lib/auth";
import { parseJsonObject } from "@/helpers/parseBody";
import {
  generateNickname,
  isAdmin,
  sameObjectId,
} from "@/helpers/communityUtils";
import { logModeration } from "@/lib/moderationLog";
import { hashSchoolEmail } from "@/lib/ban";
import mongoose from "mongoose";

function uniqueNickname(existing: Set<string>): string {
  let nickname = generateNickname();
  let guard = 0;
  while (existing.has(nickname) && guard < 30) {
    nickname = generateNickname();
    guard += 1;
  }
  return nickname;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string; appealId: string }> },
) {
  try {
    await dbConnect();
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json(
        { success: false, message: "Unauthorized" },
        { status: 401 },
      );
    }
    const { slug, appealId } = await params;

    if (!mongoose.Types.ObjectId.isValid(appealId)) {
      return Response.json(
        { success: false, message: "Invalid appeal id" },
        { status: 400 },
      );
    }

    const community = await CommunityModel.findOne({ slug });
    if (!community) {
      return Response.json(
        { success: false, message: "Community not found" },
        { status: 404 },
      );
    }
    if (!isAdmin(community, session.user.id)) {
      return Response.json(
        { success: false, message: "Only admins can decide ban appeals" },
        { status: 403 },
      );
    }

    const body = await parseJsonObject(request);
    const action = typeof body?.action === "string" ? body.action : "";
    if (action !== "approve" && action !== "deny") {
      return Response.json(
        { success: false, message: "action must be approve or deny" },
        { status: 400 },
      );
    }

    // Claim the pending appeal atomically so two admins cannot both act on it.
    const appeal = await BanAppealModel.findOneAndUpdate(
      {
        _id: appealId,
        communityId: community._id,
        status: "pending",
      },
      {
        $set: {
          status: action === "approve" ? "approved" : "denied",
          decidedBy: new mongoose.Types.ObjectId(session.user.id),
          decidedAt: new Date(),
        },
      },
      { returnDocument: "after" },
    );
    if (!appeal) {
      return Response.json(
        { success: false, message: "Pending appeal not found" },
        { status: 404 },
      );
    }

    const targetUserId = appeal.userId.toString();

    if (action === "deny") {
      await logModeration({
        communityId: community._id,
        actorId: session.user.id,
        action: "ban_appeal_denied",
        targetType: "member",
        targetId: targetUserId,
        targetUserId,
      });

      return Response.json(
        { success: true, message: "Appeal denied. The ban stays in place." },
        { status: 200 },
      );
    }

    // Approve: lift BOTH blocks (account + school email) and re-admit the
    // student immediately with a fresh nickname so their old identity is gone.
    community.bannedUserIds = community.bannedUserIds.filter(
      (id) => !sameObjectId(id, targetUserId),
    );
    community.bannedMembers = community.bannedMembers.filter(
      (b) => !sameObjectId(b.userId, targetUserId),
    );

    const user = await UserModel.findById(targetUserId).select("schoolEmail");
    if (user?.schoolEmail) {
      const hash = hashSchoolEmail(user.schoolEmail);
      community.bannedSchoolEmailHashes = (
        community.bannedSchoolEmailHashes ?? []
      ).filter((existing) => existing !== hash);
    }

    const alreadyIn =
      community.adminIds.some((id) => sameObjectId(id, targetUserId)) ||
      community.members.some((m) => sameObjectId(m.userId, targetUserId));
    if (!alreadyIn) {
      const taken = new Set(community.members.map((m) => m.nickname));
      community.members.push({
        userId: new mongoose.Types.ObjectId(targetUserId),
        nickname: uniqueNickname(taken),
        joinedAt: new Date(),
        strikes: 0,
      });
    }

    await community.save();

    // Any other pending appeals from this user are now moot.
    await BanAppealModel.updateMany(
      {
        communityId: community._id,
        userId: appeal.userId,
        status: "pending",
        _id: { $ne: appeal._id },
      },
      { $set: { status: "approved" } },
    );

    await logModeration({
      communityId: community._id,
      actorId: session.user.id,
      action: "ban_appeal_approved",
      targetType: "member",
      targetId: targetUserId,
      targetUserId,
      detail: "Ban lifted (account + school email) and student re-admitted with a new nickname",
    });

    return Response.json(
      {
        success: true,
        message:
          "Appeal approved. The student was let back in with a fresh nickname.",
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error deciding ban appeal", error);
    return Response.json(
      { success: false, message: "Error deciding ban appeal" },
      { status: 500 },
    );
  }
}
