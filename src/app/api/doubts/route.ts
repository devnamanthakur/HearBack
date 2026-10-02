import dbConnect from "@/lib/dbConnect";
import TopicModel from "@/model/Topic";
import ResponseModel from "@/model/Response";
import CommunityModel from "@/model/Community";
import { auth } from "@/lib/auth";
import { parseJsonObject } from "@/helpers/parseBody";
import { getRole, isAdmin } from "@/helpers/communityUtils";
import mongoose from "mongoose";

export async function POST(request: Request) {
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

    const body = await parseJsonObject(request);
    const targetType = body?.targetType;
    const targetId = typeof body?.targetId === "string" ? body.targetId : "";
    if (
      (targetType !== "topic" && targetType !== "response") ||
      !mongoose.Types.ObjectId.isValid(targetId)
    ) {
      return Response.json(
        { success: false, message: "Invalid request body" },
        { status: 400 },
      );
    }

    let target:
      | {
          _id: mongoose.Types.ObjectId;
          communityId: mongoose.Types.ObjectId;
          doubts: mongoose.Types.ObjectId[];
          isHidden?: boolean;
          topicId?: mongoose.Types.ObjectId;
        }
      | null = null;

    if (targetType === "topic") {
      target = await TopicModel.findById(targetId).select(
        "communityId doubts isHidden",
      );
    } else {
      target = await ResponseModel.findById(targetId).select(
        "communityId doubts isHidden topicId",
      );
    }

    if (!target) {
      return Response.json(
        { success: false, message: "Target not found" },
        { status: 404 },
      );
    }

    const community = await CommunityModel.findById(target.communityId);
    if (!community) {
      return Response.json(
        { success: false, message: "Community not found" },
        { status: 404 },
      );
    }

    if (getRole(community, userId) === "guest") {
      return Response.json(
        { success: false, message: "Join this community first" },
        { status: 403 },
      );
    }

    if (!isAdmin(community, userId)) {
      let hidden = target.isHidden === true;
      if (!hidden && targetType === "response" && target.topicId) {
        const parentTopic = await TopicModel.findById(target.topicId).select(
          "isHidden",
        );
        hidden = parentTopic?.isHidden === true;
      }
      if (hidden) {
        return Response.json(
          { success: false, message: "This content has been hidden by faculty" },
          { status: 403 },
        );
      }
    }

    const uid = new mongoose.Types.ObjectId(userId);

    // Toggle in a single atomic operation. The previous read-modify-write lost
    // one of two concurrent "same doubt" marks because the whole array was
    // $set from a stale read.
    const togglePipeline = [
      {
        $set: {
          doubts: {
            $cond: [
              { $in: [uid, { $ifNull: ["$doubts", []] }] },
              { $setDifference: [{ $ifNull: ["$doubts", []] }, [uid]] },
              { $setUnion: [{ $ifNull: ["$doubts", []] }, [uid]] },
            ],
          },
        },
      },
    ];

    const updated =
      targetType === "topic"
        ? await TopicModel.findOneAndUpdate(
            { _id: target._id },
            togglePipeline,
            { returnDocument: "after" },
          ).select("doubts")
        : await ResponseModel.findOneAndUpdate(
            { _id: target._id },
            togglePipeline,
            { returnDocument: "after" },
          ).select("doubts");

    const doubts = updated?.doubts ?? [];
    const hasDoubts = doubts.some((id) => id.equals(uid));

    return Response.json(
      {
        success: true,
        message: hasDoubts ? "Marked as same doubt" : "Removed doubt marker",
        doubtCount: doubts.length,
        hasDoubts,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error toggling doubt", error);
    return Response.json(
      { success: false, message: "Error toggling doubt" },
      { status: 500 },
    );
  }
}