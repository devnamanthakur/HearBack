import dbConnect from "@/lib/dbConnect";
import ResponseModel from "@/model/Response";
import CommunityModel from "@/model/Community";
import { auth } from "@/lib/auth";
import { parseJsonObject } from "@/helpers/parseBody";
import { isAdmin } from "@/helpers/communityUtils";
import { logModeration } from "@/lib/moderationLog";
import mongoose from "mongoose";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ responseId: string }> },
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
    const userId = session.user.id;
    const { responseId } = await params;

    if (!mongoose.Types.ObjectId.isValid(responseId)) {
      return Response.json(
        { success: false, message: "Invalid comment id" },
        { status: 400 },
      );
    }

    const body = await parseJsonObject(request);
    const wantsHide = typeof body?.isHidden === "boolean";
    const wantsReview = typeof body?.needsReview === "boolean";
    if (!wantsHide && !wantsReview) {
      return Response.json(
        {
          success: false,
          message: "isHidden or needsReview boolean is required",
        },
        { status: 400 },
      );
    }

    const response = await ResponseModel.findById(responseId);
    if (!response) {
      return Response.json(
        { success: false, message: "Comment not found" },
        { status: 404 },
      );
    }

    const community = await CommunityModel.findById(response.communityId);
    if (!community) {
      return Response.json(
        { success: false, message: "Community not found" },
        { status: 404 },
      );
    }
    if (!isAdmin(community, userId)) {
      return Response.json(
        { success: false, message: "Only admins can moderate a comment" },
        { status: 403 },
      );
    }

    if (wantsHide) {
      response.isHidden = body.isHidden as boolean;
      response.hiddenBy = response.isHidden
        ? new mongoose.Types.ObjectId(userId)
        : undefined;
      response.hiddenAt = response.isHidden ? new Date() : undefined;
      await logModeration({
        communityId: community._id,
        actorId: userId,
        action: response.isHidden ? "comment_hidden" : "comment_unhidden",
        targetType: "response",
        targetId: response._id.toString(),
        targetUserId: response.authorId,
      });
    }

    if (wantsReview) {
      response.needsReview = Boolean(body?.needsReview);
      await logModeration({
        communityId: community._id,
        actorId: userId,
        action: response.needsReview ? "content_flagged" : "content_reviewed",
        targetType: "response",
        targetId: response._id.toString(),
        targetUserId: response.authorId,
      });
    }

    await response.save();

    return Response.json(
      {
        success: true,
        message: response.isHidden
          ? "Comment hidden"
          : wantsReview && !wantsHide
            ? "Comment marked reviewed"
            : "Comment updated",
        isHidden: response.isHidden ?? false,
        needsReview: response.needsReview ?? false,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error updating comment", error);
    return Response.json(
      { success: false, message: "Error updating comment" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ responseId: string }> },
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
    const userId = session.user.id;
    const { responseId } = await params;

    if (!mongoose.Types.ObjectId.isValid(responseId)) {
      return Response.json(
        { success: false, message: "Invalid comment id" },
        { status: 400 },
      );
    }

    const response = await ResponseModel.findById(responseId);
    if (!response) {
      return Response.json(
        { success: false, message: "Comment not found" },
        { status: 404 },
      );
    }

    const community = await CommunityModel.findById(response.communityId);
    if (!community) {
      return Response.json(
        { success: false, message: "Community not found" },
        { status: 404 },
      );
    }
    if (!isAdmin(community, userId)) {
      return Response.json(
        { success: false, message: "Only admins can delete a comment" },
        { status: 403 },
      );
    }

    await response.deleteOne();

    await logModeration({
      communityId: community._id,
      actorId: userId,
      action: "comment_deleted",
      targetType: "response",
      targetId: responseId,
      targetUserId: response.authorId,
      detail: response.body.slice(0, 120),
    });

    return Response.json(
      { success: true, message: "Comment deleted" },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error deleting comment", error);
    return Response.json(
      { success: false, message: "Error deleting comment" },
      { status: 500 },
    );
  }
}
