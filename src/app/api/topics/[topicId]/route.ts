import dbConnect from "@/lib/dbConnect";
import TopicModel from "@/model/Topic";
import ResponseModel from "@/model/Response";
import CommunityModel from "@/model/Community";
import { auth } from "@/lib/auth";
import { parseJsonObject } from "@/helpers/parseBody";
import mongoose from "mongoose";
import { isAdmin } from "@/helpers/communityUtils";
import { logModeration } from "@/lib/moderationLog";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ topicId: string }> },
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
    const { topicId } = await params;

    if (!mongoose.Types.ObjectId.isValid(topicId)) {
      return Response.json(
        { success: false, message: "Invalid topic id" },
        { status: 400 },
      );
    }

    const body = await parseJsonObject(request);
    const wantsClose = typeof body?.isClosed === "boolean";
    const wantsHide = typeof body?.isHidden === "boolean";
    const wantsReview = typeof body?.needsReview === "boolean";
    if (!wantsClose && !wantsHide && !wantsReview) {
      return Response.json(
        {
          success: false,
          message:
            "At least one of isClosed, isHidden or needsReview boolean is required",
        },
        { status: 400 },
      );
    }

    const topic = await TopicModel.findById(topicId);
    if (!topic) {
      return Response.json(
        { success: false, message: "Topic not found" },
        { status: 404 },
      );
    }

    const community = await CommunityModel.findById(topic.communityId);
    if (!community) {
      return Response.json(
        { success: false, message: "Community not found" },
        { status: 404 },
      );
    }

    if (!isAdmin(community, userId)) {
      return Response.json(
        { success: false, message: "Only admins can moderate a topic" },
        { status: 403 },
      );
    }

    const changed: string[] = [];

    if (wantsHide) {
      topic.isHidden = Boolean(body?.isHidden);
      topic.hiddenBy = topic.isHidden
        ? new mongoose.Types.ObjectId(userId)
        : undefined;
      topic.hiddenAt = topic.isHidden ? new Date() : undefined;
      changed.push(topic.isHidden ? "hidden" : "visible");
      await logModeration({
        communityId: community._id,
        actorId: userId,
        action: topic.isHidden ? "topic_hidden" : "topic_unhidden",
        targetType: "topic",
        targetId: topic._id.toString(),
        targetUserId: topic.authorId,
      });
    }

    if (wantsClose) {
      topic.isClosed = Boolean(body?.isClosed);
      changed.push(topic.isClosed ? "closed" : "reopened");
      await logModeration({
        communityId: community._id,
        actorId: userId,
        action: topic.isClosed ? "topic_closed" : "topic_reopened",
        targetType: "topic",
        targetId: topic._id.toString(),
      });
    }

    if (wantsReview) {
      topic.needsReview = Boolean(body?.needsReview);
      changed.push(topic.needsReview ? "flagged for review" : "reviewed");
      await logModeration({
        communityId: community._id,
        actorId: userId,
        action: topic.needsReview ? "content_flagged" : "content_reviewed",
        targetType: "topic",
        targetId: topic._id.toString(),
        targetUserId: topic.authorId,
      });
    }

    await topic.save();

    return Response.json(
      {
        success: true,
        message: `Topic ${changed.join(", ")}`,
        isHidden: topic.isHidden ?? false,
        isClosed: topic.isClosed,
        needsReview: topic.needsReview ?? false,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error updating topic", error);
    return Response.json(
      { success: false, message: "Error updating topic" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ topicId: string }> },
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
    const { topicId } = await params;

    if (!mongoose.Types.ObjectId.isValid(topicId)) {
      return Response.json(
        { success: false, message: "Invalid topic id" },
        { status: 400 },
      );
    }

    const topic = await TopicModel.findById(topicId);
    if (!topic) {
      return Response.json(
        { success: false, message: "Topic not found" },
        { status: 404 },
      );
    }

    const community = await CommunityModel.findById(topic.communityId);
    if (!community) {
      return Response.json(
        { success: false, message: "Community not found" },
        { status: 404 },
      );
    }

    if (!isAdmin(community, userId)) {
      return Response.json(
        { success: false, message: "Only admins can delete a topic" },
        { status: 403 },
      );
    }

    await ResponseModel.deleteMany({ topicId: topic._id });
    await topic.deleteOne();

    await logModeration({
      communityId: community._id,
      actorId: userId,
      action: "topic_deleted",
      targetType: "topic",
      targetId: topicId,
      targetUserId: topic.authorId,
      detail: topic.title,
    });

    return Response.json(
      { success: true, message: "Topic deleted" },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error deleting topic", error);
    return Response.json(
      { success: false, message: "Error deleting topic" },
      { status: 500 },
    );
  }
}
