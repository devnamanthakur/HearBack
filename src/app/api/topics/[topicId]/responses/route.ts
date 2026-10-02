import dbConnect from "@/lib/dbConnect";
import TopicModel from "@/model/Topic";
import CommunityModel from "@/model/Community";
import ResponseModel from "@/model/Response";
import { auth } from "@/lib/auth";
import { createResponseSchema } from "@/schema/communitySchema";
import { getRole, getMemberNickname } from "@/helpers/communityUtils";
import { listResponsesForUser } from "@/lib/communityQueries";
import { checkPostingRate, mutedRemainingMs, runContentPipeline } from "@/lib/moderationPipeline";
import { formatRetryAfter } from "@/lib/rateLimit";
import {
  parseMultipartForm,
  fileToAttachment,
  IMAGE_MIMES,
  IMAGE_MAX_BYTES,
  type AttachmentData,
} from "@/helpers/uploads";
import mongoose from "mongoose";

export async function GET(
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

    const data = await listResponsesForUser(topicId, userId);
    if (!data || !data.topic) {
      return Response.json(
        { success: false, message: "Topic not found" },
        { status: 404 },
      );
    }
    if (data.role === "guest") {
      return Response.json(
        { success: false, message: "Join this community to view responses" },
        { status: 403 },
      );
    }
    if (data.hidden) {
      return Response.json(
        { success: false, message: "This topic has been hidden by faculty" },
        { status: 403 },
      );
    }

    return Response.json(
      {
        success: true,
        role: data.role,
        isClosed: data.isClosed,
        responses: data.responses,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error fetching responses", error);
    return Response.json(
      { success: false, message: "Error fetching responses" },
      { status: 500 },
    );
  }
}

export async function POST(
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

    const role = getRole(community, userId);
    if (role === "guest") {
      return Response.json(
        { success: false, message: "Join this community to post a response" },
        { status: 403 },
      );
    }

    if (topic.isClosed && role !== "admin") {
      return Response.json(
        { success: false, message: "This topic is closed for new opinions" },
        { status: 403 },
      );
    }

    if (topic.isHidden && role !== "admin") {
      return Response.json(
        { success: false, message: "This topic has been hidden by faculty" },
        { status: 403 },
      );
    }

    const muteLeftMs = mutedRemainingMs(community, userId);
    if (muteLeftMs > 0) {
      return Response.json(
        {
          success: false,
          message: `You are muted in this community for ${formatRetryAfter(muteLeftMs)} because of repeated rule breaks.`,
        },
        { status: 403 },
      );
    }

    if (role === "member") {
      const rate = await checkPostingRate(userId, "response");
      if (!rate.allowed) {
        return Response.json(
          {
            success: false,
            message: `You are commenting too fast. Try again in ${formatRetryAfter(rate.retryAfterMs)}.`,
          },
          { status: 429 },
        );
      }
    }

    const { fields, files } = await parseMultipartForm(request);
    const parsed = createResponseSchema.safeParse({
      body: fields.body,
      replyToId: fields.replyToId ?? null,
    });
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => issue.message);
      return Response.json(
        { success: false, message: issues.join(", ") },
        { status: 400 },
      );
    }

    let image: AttachmentData | undefined;
    if (files.image) {
      const result = await fileToAttachment(
        files.image,
        IMAGE_MAX_BYTES,
        IMAGE_MIMES,
      );
      if ("error" in result) {
        return Response.json(
          { success: false, message: result.error },
          { status: 400 },
        );
      }
      image = result;
    }

    const moderation = await runContentPipeline({
      community,
      userId,
      text: parsed.data.body,
    });
    if (moderation.blocked) {
      return Response.json(
        {
          success: false,
          message: moderation.message,
          strikes: moderation.strikes,
          muted: moderation.autoMuted,
        },
        { status: 400 },
      );
    }

    const replyToId = parsed.data.replyToId ?? null;
    if (replyToId) {
      const replyTarget = await ResponseModel.findById(replyToId);
      if (
        !replyTarget ||
        replyTarget.topicId.toString() !== topic._id.toString()
      ) {
        return Response.json(
          { success: false, message: "Invalid reply reference" },
          { status: 400 },
        );
      }
    }

    const response = await ResponseModel.create({
      topicId: topic._id,
      communityId: community._id,
      authorId: new mongoose.Types.ObjectId(userId),
      role,
      authorNickname:
        role === "member" ? getMemberNickname(community, userId) : undefined,
      body: parsed.data.body,
      image,
      replyToId: replyToId ? new mongoose.Types.ObjectId(replyToId) : null,
      needsReview: moderation.needsReview,
    });

    return Response.json(
      {
        success: true,
        message: "Response posted",
        underReview: moderation.needsReview,
        response: {
          _id: response._id.toString(),
          body: response.body,
          role: response.role,
          replyToId: response.replyToId?.toString() ?? null,
          createdAt: response.createdAt,
          isMine: true,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error posting response", error);
    return Response.json(
      { success: false, message: "Error posting response" },
      { status: 500 },
    );
  }
}