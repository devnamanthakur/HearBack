import dbConnect from "@/lib/dbConnect";
import CommunityModel from "@/model/Community";
import BanAppealModel from "@/model/BanAppeal";
import UserModel from "@/model/User";
import { auth } from "@/lib/auth";
import { parseJsonObject } from "@/helpers/parseBody";
import { isAdmin, sameObjectId } from "@/helpers/communityUtils";
import { consumeRateLimit, formatRetryAfter } from "@/lib/rateLimit";
import { hashSchoolEmail } from "@/lib/ban";
import mongoose from "mongoose";

export async function GET(
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
    const { slug } = await params;

    const community = await CommunityModel.findOne({ slug });
    if (!community) {
      return Response.json(
        { success: false, message: "Community not found" },
        { status: 404 },
      );
    }
    if (!isAdmin(community, session.user.id)) {
      return Response.json(
        { success: false, message: "Only admins can view ban appeals" },
        { status: 403 },
      );
    }

    const url = new URL(request.url);
    const statusParam = url.searchParams.get("status") ?? "pending";
    const filter: Record<string, unknown> = { communityId: community._id };
    if (statusParam !== "all") filter.status = statusParam;

    const appeals = await BanAppealModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(50);

    return Response.json(
      {
        success: true,
        appeals: appeals.map((appeal) => ({
          _id: appeal._id.toString(),
          userId: appeal.userId.toString(),
          nickname: appeal.nickname,
          message: appeal.message,
          status: appeal.status,
          createdAt: appeal.createdAt,
        })),
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error fetching ban appeals", error);
    return Response.json(
      { success: false, message: "Error fetching ban appeals" },
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
    const { slug } = await params;

    const attempt = await consumeRateLimit(
      `appeal:${userId}`,
      3,
      60 * 60 * 1000,
    );
    if (!attempt.allowed) {
      return Response.json(
        {
          success: false,
          message: `Too many appeals. Try again in ${formatRetryAfter(attempt.retryAfterMs)}.`,
        },
        { status: 429 },
      );
    }

    const body = await parseJsonObject(request);
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    if (message.length < 5) {
      return Response.json(
        {
          success: false,
          message: "Please explain in a sentence why you should be allowed back.",
        },
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

    // A student can be blocked either by account id (bannedUserIds) or by the
    // hashed school email (a fresh account with the same address). Either one
    // qualifies them to appeal, otherwise the email-blocked case is a dead end.
    const user = await UserModel.findById(userId).select(
      "schoolEmail schoolEmailVerifiedAt",
    );
    const schoolHash =
      user?.schoolEmail && user.schoolEmailVerifiedAt
        ? hashSchoolEmail(user.schoolEmail)
        : undefined;
    const isBanned =
      community.bannedUserIds.some((id) => sameObjectId(id, userId)) ||
      (schoolHash
        ? (community.bannedSchoolEmailHashes ?? []).includes(schoolHash)
        : false);
    if (!isBanned) {
      return Response.json(
        {
          success: false,
          message: "You are not banned from this community.",
        },
        { status: 400 },
      );
    }

    const existing = await BanAppealModel.findOne({
      communityId: community._id,
      userId,
      status: "pending",
    });
    if (existing) {
      return Response.json(
        {
          success: false,
          message: "You already have an appeal waiting for the teacher.",
        },
        { status: 400 },
      );
    }

    // Use the nickname the student posted under before the ban, so the teacher
    // sees the appeal from the same pseudonym they already know. The client
    // cannot choose this name.
    const bannedEntry = community.bannedMembers.find((b) =>
      sameObjectId(b.userId, userId),
    );

    await BanAppealModel.create({
      communityId: community._id,
      userId: new mongoose.Types.ObjectId(userId),
      nickname: bannedEntry?.nickname ?? "A banned student",
      message: message.slice(0, 500),
      status: "pending",
    });

    return Response.json(
      {
        success: true,
        message:
          "Your appeal was sent. The teacher will decide whether to let you back in.",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating ban appeal", error);
    return Response.json(
      { success: false, message: "Error creating ban appeal" },
      { status: 500 },
    );
  }
}
