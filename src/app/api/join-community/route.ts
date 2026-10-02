import dbConnect from "@/lib/dbConnect";
import CommunityModel from "@/model/Community";
import UserModel from "@/model/User";
import JoinRequestModel from "@/model/JoinRequest";
import { auth } from "@/lib/auth";
import { joinCommunitySchema } from "@/schema/communitySchema";
import { parseJsonObject } from "@/helpers/parseBody";
import { generateNickname, getMember, sameObjectId } from "@/helpers/communityUtils";
import { checkNickname } from "@/lib/moderation";
import { domainMatchesPatterns } from "@/helpers/emailDomains";
import { consumeRateLimit, formatRetryAfter } from "@/lib/rateLimit";
import { hashSchoolEmail } from "@/lib/ban";
import mongoose from "mongoose";

const NICKNAME_MAX = 24;

function sanitizeNickname(value: string | undefined): string | null {
  const trimmed = value?.trim().slice(0, NICKNAME_MAX);
  if (!trimmed) return null;
  if (!/^[A-Za-z0-9 _-]+$/.test(trimmed)) return null;
  return trimmed;
}

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
    if (!body) {
      return Response.json(
        { success: false, message: "Invalid request body." },
        { status: 400 },
      );
    }

    const parsed = joinCommunitySchema.safeParse(body);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => issue.message);
      return Response.json(
        { success: false, message: issues.join(", ") },
        { status: 400 },
      );
    }

    const attempt = await consumeRateLimit(`join:${userId}`, 10, 10 * 60 * 1000);
    if (!attempt.allowed) {
      return Response.json(
        {
          success: false,
          message: `Too many join attempts. Try again in ${formatRetryAfter(attempt.retryAfterMs)}.`,
        },
        { status: 429 },
      );
    }

    const community = await CommunityModel.findOne({
      inviteCode: parsed.data.inviteCode.toUpperCase(),
    });
    if (!community) {
      return Response.json(
        { success: false, message: "Incorrect invite code" },
        { status: 404 },
      );
    }

    if (
      community.inviteCodeExpiresAt &&
      community.inviteCodeExpiresAt.getTime() <= Date.now()
    ) {
      return Response.json(
        {
          success: false,
          message:
            "This invite code has expired. Ask your teacher for a fresh one.",
        },
        { status: 410 },
      );
    }

    if (community.bannedUserIds.some((id) => sameObjectId(id, userId))) {
      return Response.json(
        {
          success: false,
          message: "You are banned from this community and cannot rejoin.",
          banned: true,
          slug: community.slug,
        },
        { status: 403 },
      );
    }

    const isInCommunity =
      community.adminIds.some((id) => sameObjectId(id, userId)) ||
      community.members.some((m) => sameObjectId(m.userId, userId));

    if (isInCommunity) {
      const member = getMember(community, userId);
      return Response.json(
        {
          success: false,
          message: "You are already in this community",
          nickname: member?.nickname,
        },
        { status: 400 },
      );
    }

    if (community.type === "educational") {
      const user = await UserModel.findById(userId).select(
        "schoolEmail schoolDomain schoolEmailVerifiedAt",
      );
      if (!user?.schoolEmailVerifiedAt || !user.schoolDomain) {
        return Response.json(
          {
            success: false,
            message:
              "This is an educational community. Verify your school email from the dashboard first, then join.",
            needsSchoolEmail: true,
          },
          { status: 403 },
        );
      }
      if (
        !domainMatchesPatterns(
          user.schoolDomain,
          community.requiredEmailDomains,
        )
      ) {
        return Response.json(
          {
            success: false,
            message: `This community only accepts emails like ${community.requiredEmailDomains
              .map((d) => `@${d}`)
              .join(", ")}. Your verified school email does not match.`,
          },
          { status: 403 },
        );
      }

      // A banned student's verified school email is blocked too, so creating a
      // fresh account with the same email cannot get back in.
      if (user.schoolEmail) {
        const bannedHash = hashSchoolEmail(user.schoolEmail);
        if ((community.bannedSchoolEmailHashes ?? []).includes(bannedHash)) {
          return Response.json(
            {
              success: false,
              message: "You are banned from this community and cannot rejoin.",
              banned: true,
              slug: community.slug,
            },
            { status: 403 },
          );
        }
      }
    }

    const chosen = sanitizeNickname(
      typeof body.nickname === "string" ? body.nickname : undefined,
    );
    if (chosen) {
      const nicknameCheck = checkNickname(chosen);
      if (!nicknameCheck.ok) {
        return Response.json(
          { success: false, message: nicknameCheck.message },
          { status: 400 },
        );
      }
    }

    let nickname = chosen ?? generateNickname();

    const taken = new Set(community.members.map((m) => m.nickname));
    if (taken.has(nickname)) {
      if (chosen) {
        return Response.json(
          {
            success: false,
            message: "That nickname is already taken",
            suggestion: generateNickname(),
          },
          { status: 400 },
        );
      }
      let guard = 0;
      while (taken.has(nickname) && guard < 20) {
        nickname = generateNickname();
        guard += 1;
      }
    }

    if (community.joinPolicy === "approval") {
      const existing = await JoinRequestModel.findOne({
        communityId: community._id,
        userId,
        status: "pending",
      });
      if (existing) {
        return Response.json(
          {
            success: false,
            message: "Your request is already waiting for teacher approval.",
          },
          { status: 400 },
        );
      }
      await JoinRequestModel.create({
        communityId: community._id,
        userId: new mongoose.Types.ObjectId(userId),
        nickname,
        status: "pending",
      });
      return Response.json(
        {
          success: true,
          pending: true,
          message:
            "Your join request was sent. A teacher must approve it before you can enter.",
        },
        { status: 202 },
      );
    }

    community.members.push({
      userId: new mongoose.Types.ObjectId(userId),
      nickname,
      joinedAt: new Date(),
      strikes: 0,
    });
    await community.save();

    return Response.json(
      {
        success: true,
        message: "Joined community successfully",
        slug: community.slug,
        nickname,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error joining community", error);
    return Response.json(
      { success: false, message: "Error joining community" },
      { status: 500 },
    );
  }
}
