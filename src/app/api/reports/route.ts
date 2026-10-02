import dbConnect from "@/lib/dbConnect";
import CommunityModel from "@/model/Community";
import TopicModel from "@/model/Topic";
import ResponseModel from "@/model/Response";
import ReportModel from "@/model/Report";
import { auth } from "@/lib/auth";
import { parseJsonObject } from "@/helpers/parseBody";
import { getRole, sameObjectId } from "@/helpers/communityUtils";
import { consumeRateLimit, formatRetryAfter } from "@/lib/rateLimit";
import mongoose from "mongoose";

const DUPLICATE_REPORT_MESSAGE =
  "You already reported this. A teacher will review it.";

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

    const reportLimit = await consumeRateLimit(
      `report:${userId}`,
      10,
      60 * 60 * 1000,
    );
    if (!reportLimit.allowed) {
      return Response.json(
        {
          success: false,
          message: `You have sent too many reports. Try again in ${formatRetryAfter(reportLimit.retryAfterMs)}.`,
        },
        { status: 429 },
      );
    }

    const body = await parseJsonObject(request);
    const targetType = body?.targetType;
    const targetId = typeof body?.targetId === "string" ? body.targetId : "";
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    const note = typeof body?.note === "string" ? body.note.trim() : undefined;

    if (
      (targetType !== "topic" && targetType !== "response") ||
      !mongoose.Types.ObjectId.isValid(targetId) ||
      reason.length < 3
    ) {
      return Response.json(
        {
          success: false,
          message:
            "Invalid report. Provide targetType, targetId and a short reason.",
        },
        { status: 400 },
      );
    }

    const target =
      targetType === "topic"
        ? await TopicModel.findById(targetId)
        : await ResponseModel.findById(targetId);
    if (!target) {
      return Response.json(
        { success: false, message: "Reported content not found" },
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
        { success: false, message: "Join this community to report content" },
        { status: 403 },
      );
    }

    if (sameObjectId(target.authorId, userId)) {
      return Response.json(
        { success: false, message: "You cannot report your own content" },
        { status: 400 },
      );
    }

    const duplicate = await ReportModel.findOne({
      targetId: target._id,
      reporterId: userId,
      status: "pending",
    });
    if (duplicate) {
      return Response.json(
        {
          success: false,
          message: "You already reported this. A teacher will review it.",
        },
        { status: 400 },
      );
    }

    try {
      await ReportModel.create({
        communityId: community._id,
        targetType,
        targetId: target._id,
        reporterId: new mongoose.Types.ObjectId(userId),
        reason: reason.slice(0, 200),
        note: note ? note.slice(0, 500) : undefined,
        status: "pending",
      });
    } catch (error) {
      // Partial unique index race: another request created the same pending
      // report between the duplicate check and this insert.
      const code = (error as { code?: unknown })?.code;
      if (code === 11000 || code === 11001) {
        return Response.json(
          { success: false, message: DUPLICATE_REPORT_MESSAGE },
          { status: 400 },
        );
      }
      throw error;
    }

    return Response.json(
      {
        success: true,
        message: "Report sent. A teacher will review this content.",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating report", error);
    return Response.json(
      { success: false, message: "Error creating report" },
      { status: 500 },
    );
  }
}
