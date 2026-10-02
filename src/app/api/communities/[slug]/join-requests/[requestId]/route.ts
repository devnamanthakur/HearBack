import dbConnect from "@/lib/dbConnect";
import CommunityModel from "@/model/Community";
import JoinRequestModel from "@/model/JoinRequest";
import { auth } from "@/lib/auth";
import { parseJsonObject } from "@/helpers/parseBody";
import { isAdmin, sameObjectId } from "@/helpers/communityUtils";
import { logModeration } from "@/lib/moderationLog";
import mongoose from "mongoose";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string; requestId: string }> },
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
    const { slug, requestId } = await params;

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return Response.json(
        { success: false, message: "Invalid request id" },
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
        { success: false, message: "Only admins can decide join requests" },
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

    // Claim the pending request atomically so two admins cannot both act on it.
    const joinRequest = await JoinRequestModel.findOneAndUpdate(
      {
        _id: requestId,
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
    if (!joinRequest) {
      return Response.json(
        { success: false, message: "Pending request not found" },
        { status: 404 },
      );
    }

    const revertClaim = async () => {
      joinRequest.status = "pending";
      joinRequest.decidedBy = undefined;
      joinRequest.decidedAt = undefined;
      await joinRequest.save();
    };

    if (action === "deny") {
      await logModeration({
        communityId: community._id,
        actorId: session.user.id,
        action: "join_request_denied",
        targetType: "member",
        targetId: joinRequest.userId.toString(),
        targetUserId: joinRequest.userId,
      });
      return Response.json(
        { success: true, message: "Join request denied" },
        { status: 200 },
      );
    }

    if (
      community.bannedUserIds.some((id) =>
        sameObjectId(id, joinRequest.userId.toString()),
      )
    ) {
      await revertClaim();
      return Response.json(
        {
          success: false,
          message: "This user is banned from the community. Deny the request.",
        },
        { status: 400 },
      );
    }

    const alreadyMember = community.members.some((m) =>
      sameObjectId(m.userId, joinRequest.userId.toString()),
    );
    if (!alreadyMember) {
      const nicknameTaken = community.members.some(
        (m) => m.nickname === joinRequest.nickname,
      );
      if (nicknameTaken) {
        await revertClaim();
        return Response.json(
          {
            success: false,
            message:
              "That nickname was taken by someone else. Deny this request and ask the student to join again.",
          },
          { status: 400 },
        );
      }
      community.members.push({
        userId: joinRequest.userId,
        nickname: joinRequest.nickname,
        joinedAt: new Date(),
        strikes: 0,
      });
      await community.save();
    }

    await logModeration({
      communityId: community._id,
      actorId: session.user.id,
      action: "join_request_approved",
      targetType: "member",
      targetId: joinRequest.userId.toString(),
      targetUserId: joinRequest.userId,
    });

    return Response.json(
      { success: true, message: "Join request approved" },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error deciding join request", error);
    return Response.json(
      { success: false, message: "Error deciding join request" },
      { status: 500 },
    );
  }
}
