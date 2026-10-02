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

const MUTE_DEFAULT_HOURS = 24;
const MUTE_MAX_HOURS = 168;

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
  { params }: { params: Promise<{ slug: string; userId: string }> },
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
    const adminId = session.user.id;
    const { slug, userId } = await params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return Response.json(
        { success: false, message: "Invalid user id" },
        { status: 400 },
      );
    }

    const body = await parseJsonObject(request);
    const action = typeof body?.action === "string" ? body.action : "";

    const community = await CommunityModel.findOne({ slug });
    if (!community) {
      return Response.json(
        { success: false, message: "Community not found" },
        { status: 404 },
      );
    }
    if (!isAdmin(community, adminId)) {
      return Response.json(
        { success: false, message: "Only admins can moderate members" },
        { status: 403 },
      );
    }
    if (sameObjectId(userId, adminId)) {
      return Response.json(
        { success: false, message: "You cannot moderate yourself" },
        { status: 400 },
      );
    }
    if (community.adminIds.some((id) => sameObjectId(id, userId))) {
      return Response.json(
        { success: false, message: "You cannot moderate another admin" },
        { status: 400 },
      );
    }

    const memberIndex = community.members.findIndex((m) =>
      sameObjectId(m.userId, userId),
    );
    const isBanned = community.bannedUserIds.some((id) =>
      sameObjectId(id, userId),
    );

    const targetObjectId = new mongoose.Types.ObjectId(userId);

    switch (action) {
      case "mute": {
        if (memberIndex === -1) {
          return Response.json(
            { success: false, message: "This user is not a member" },
            { status: 404 },
          );
        }
        const requested =
          typeof body?.hours === "number" && body.hours > 0
            ? body.hours
            : MUTE_DEFAULT_HOURS;
        const hours = Math.min(requested, MUTE_MAX_HOURS);
        community.members[memberIndex].mutedUntil = new Date(
          Date.now() + hours * 60 * 60 * 1000,
        );
        await community.save();
        await logModeration({
          communityId: community._id,
          actorId: adminId,
          action: "member_muted",
          targetType: "member",
          targetId: userId,
          targetUserId: targetObjectId,
          detail: `Muted for ${hours} hour(s)`,
        });
        return Response.json(
          {
            success: true,
            message: `Member muted for ${hours} hour(s)`,
          },
          { status: 200 },
        );
      }
      case "unmute": {
        if (memberIndex === -1) {
          return Response.json(
            { success: false, message: "This user is not a member" },
            { status: 404 },
          );
        }
        community.members[memberIndex].mutedUntil = undefined;
        await community.save();
        await logModeration({
          communityId: community._id,
          actorId: adminId,
          action: "member_unmuted",
          targetType: "member",
          targetId: userId,
          targetUserId: targetObjectId,
        });
        return Response.json(
          { success: true, message: "Member unmuted" },
          { status: 200 },
        );
      }
      case "remove": {
        if (memberIndex === -1) {
          return Response.json(
            { success: false, message: "This user is not a member" },
            { status: 404 },
          );
        }
        community.members.splice(memberIndex, 1);
        await community.save();
        await logModeration({
          communityId: community._id,
          actorId: adminId,
          action: "member_removed",
          targetType: "member",
          targetId: userId,
          targetUserId: targetObjectId,
        });
        return Response.json(
          { success: true, message: "Member removed from the community" },
          { status: 200 },
        );
      }
      case "ban": {
        const pastNickname =
          memberIndex !== -1
            ? community.members[memberIndex].nickname
            : undefined;
        if (memberIndex !== -1) {
          community.members.splice(memberIndex, 1);
        }
        if (!isBanned) {
          community.bannedUserIds.push(targetObjectId);
        }
        if (
          !community.bannedMembers.some((b) =>
            sameObjectId(b.userId, userId),
          )
        ) {
          community.bannedMembers.push({
            userId: targetObjectId,
            nickname: pastNickname ?? "Anonymous",
            bannedAt: new Date(),
          });
        }
        const bannedUser = await UserModel.findById(userId).select(
          "schoolEmail schoolEmailVerifiedAt",
        );
        if (bannedUser?.schoolEmail && bannedUser.schoolEmailVerifiedAt) {
          const hash = hashSchoolEmail(bannedUser.schoolEmail);
          if (!community.bannedSchoolEmailHashes.includes(hash)) {
            community.bannedSchoolEmailHashes.push(hash);
          }
        }
        await community.save();
        await logModeration({
          communityId: community._id,
          actorId: adminId,
          action: "member_banned",
          targetType: "member",
          targetId: userId,
          targetUserId: targetObjectId,
          detail: "Account + school-email block applied",
        });
        return Response.json(
          { success: true, message: "Member banned from this community" },
          { status: 200 },
        );
      }
      case "unban": {
        // Lift BOTH blocks (account + school email) and re-admit the student
        // immediately with a fresh nickname, exactly like an approved appeal.
        community.bannedUserIds = community.bannedUserIds.filter(
          (id) => !sameObjectId(id, userId),
        );
        community.bannedMembers = community.bannedMembers.filter(
          (b) => !sameObjectId(b.userId, userId),
        );

        const unbannedUser = await UserModel.findById(userId).select(
          "schoolEmail",
        );
        if (unbannedUser?.schoolEmail) {
          const hash = hashSchoolEmail(unbannedUser.schoolEmail);
          community.bannedSchoolEmailHashes = (
            community.bannedSchoolEmailHashes ?? []
          ).filter((existing) => existing !== hash);
        }

        const alreadyIn =
          community.adminIds.some((id) => sameObjectId(id, userId)) ||
          community.members.some((m) => sameObjectId(m.userId, userId));
        if (!alreadyIn) {
          const taken = new Set(community.members.map((m) => m.nickname));
          community.members.push({
            userId: targetObjectId,
            nickname: uniqueNickname(taken),
            joinedAt: new Date(),
            strikes: 0,
          });
        }

        await community.save();

        await BanAppealModel.updateMany(
          {
            communityId: community._id,
            userId: targetObjectId,
            status: "pending",
          },
          { $set: { status: "approved" } },
        );

        await logModeration({
          communityId: community._id,
          actorId: adminId,
          action: "member_unbanned",
          targetType: "member",
          targetId: userId,
          targetUserId: targetObjectId,
          detail: "Account + school-email block lifted; re-admitted with a new nickname",
        });
        return Response.json(
          {
            success: true,
            message: "Member unbanned and let back in with a new nickname",
          },
          { status: 200 },
        );
      }
      default:
        return Response.json(
          {
            success: false,
            message: "Unknown action. Use mute, unmute, remove, ban or unban.",
          },
          { status: 400 },
        );
    }
  } catch (error) {
    console.error("Error moderating member", error);
    return Response.json(
      { success: false, message: "Error moderating member" },
      { status: 500 },
    );
  }
}
