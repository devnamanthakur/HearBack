import dbConnect from "@/lib/dbConnect";
import CommunityModel from "@/model/Community";
import TopicModel from "@/model/Topic";
import { auth } from "@/lib/auth";
import { createTopicSchema } from "@/schema/communitySchema";
import { getRole, isAdmin, getMemberNickname } from "@/helpers/communityUtils";
import { listTopicsForUser } from "@/lib/communityQueries";
import { checkPostingRate, mutedRemainingMs, runContentPipeline } from "@/lib/moderationPipeline";
import { formatRetryAfter } from "@/lib/rateLimit";
import {
  parseMultipartForm,
  fileToAttachment,
  IMAGE_MIMES,
  IMAGE_MAX_BYTES,
  PDF_MIME,
  PDF_MAX_BYTES,
  MAX_COMBINED_ATTACHMENT_BYTES,
  type AttachmentData,
} from "@/helpers/uploads";
import mongoose from "mongoose";

function cleanNotesUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return trimmed.slice(0, 500);
  } catch {
    return undefined;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
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
    const { slug } = await params;

    const community = await CommunityModel.findOne({ slug });
    if (!community) {
      return Response.json(
        { success: false, message: "Community not found" },
        { status: 404 },
      );
    }

    const { role, topics } = await listTopicsForUser(
      community._id.toString(),
      userId,
    );
    if (role === "guest") {
      return Response.json(
        { success: false, message: "Join this community to view topics" },
        { status: 403 },
      );
    }

    return Response.json(
      {
        success: true,
        role,
        community: {
          slug: community.slug,
          name: community.name,
          avatarColor: community.avatarColor,
        },
        topics,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error fetching topics", error);
    return Response.json(
      { success: false, message: "Error fetching topics" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
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

    const { fields, files } = await parseMultipartForm(request);
    const parsed = createTopicSchema.safeParse({
      title: fields.title,
      body: fields.body,
    });
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => issue.message);
      return Response.json(
        { success: false, message: issues.join(", ") },
        { status: 400 },
      );
    }

    const notesUrl = cleanNotesUrl(fields.notesUrl);
    let image: AttachmentData | undefined;
    let attachment: AttachmentData | undefined;

    // Guard against image + PDF together exceeding MongoDB's document limit.
    const combinedBytes =
      (files.image?.size ?? 0) + (files.attachment?.size ?? 0);
    if (combinedBytes > MAX_COMBINED_ATTACHMENT_BYTES) {
      return Response.json(
        {
          success: false,
          message:
            "The image and PDF together are too large to store on one post. Attach a smaller file or post them separately.",
        },
        { status: 400 },
      );
    }

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

    if (files.attachment) {
      const result = await fileToAttachment(
        files.attachment,
        PDF_MAX_BYTES,
        [PDF_MIME],
      );
      if ("error" in result) {
        return Response.json(
          { success: false, message: result.error },
          { status: 400 },
        );
      }
      attachment = result;
    }

    const { slug } = await params;
    const community = await CommunityModel.findOne({ slug });
    if (!community) {
      return Response.json(
        { success: false, message: "Community not found" },
        { status: 404 },
      );
    }

    const role = getRole(community, userId);
    if (role === "guest") {
      return Response.json(
        { success: false, message: "Join this community to post a topic" },
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
      const rate = await checkPostingRate(userId, "topic");
      if (!rate.allowed) {
        return Response.json(
          {
            success: false,
            message: `You are posting too fast. Try again in ${formatRetryAfter(rate.retryAfterMs)}.`,
          },
          { status: 429 },
        );
      }
    }

    const moderation = await runContentPipeline({
      community,
      userId,
      text: `${parsed.data.title}\n${parsed.data.body}`,
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

    const topic = await TopicModel.create({
      communityId: community._id,
      authorId: new mongoose.Types.ObjectId(userId),
      role,
      authorNickname: role === "member" ? getMemberNickname(community, userId) : undefined,
      title: parsed.data.title,
      body: parsed.data.body,
      notesUrl,
      image,
      attachment,
      isClosed: false,
      needsReview: moderation.needsReview,
    });

    return Response.json(
      {
        success: true,
        message: "Topic posted successfully",
        isAdminPost: isAdmin(community, userId),
        topic: {
          _id: topic._id.toString(),
          title: topic.title,
          body: topic.body,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating topic", error);
    return Response.json(
      { success: false, message: "Error creating topic" },
      { status: 500 },
    );
  }
}