import dbConnect from "@/lib/dbConnect";
import CommunityModel from "@/model/Community";
import { auth } from "@/lib/auth";
import { createCommunitySchema } from "@/schema/communitySchema";
import { parseJsonObject } from "@/helpers/parseBody";
import {
  slugify,
  generateInviteCode,
} from "@/helpers/communityUtils";
import {
  serializeCommunity,
  listCommunitiesForUser,
} from "@/lib/communityQueries";
import { checkContent } from "@/lib/moderation";
import {
  isAllowedSchoolEmail,
  normalizeDomainPattern,
} from "@/helpers/emailDomains";
import {
  DEFAULT_INVITE_TTL_HOURS,
  inviteExpiryFromHours,
} from "@/helpers/inviteTtl";
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
    if (!body) {
      return Response.json(
        {
          success: false,
          message: "Invalid request body. Expected name and description.",
        },
        { status: 400 },
      );
    }

    const parsed = createCommunitySchema.safeParse(body);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => issue.message);
      return Response.json(
        { success: false, message: issues.join(", ") },
        { status: 400 },
      );
    }

    const nameCheck = checkContent(parsed.data.name);
    if (!nameCheck.ok) {
      return Response.json(
        { success: false, message: `Community name: ${nameCheck.message}` },
        { status: 400 },
      );
    }
    const descriptionCheck = checkContent(parsed.data.description);
    if (!descriptionCheck.ok) {
      return Response.json(
        {
          success: false,
          message: `Description: ${descriptionCheck.message}`,
        },
        { status: 400 },
      );
    }

    const type = parsed.data.type ?? "normal";
    let requiredEmailDomains: string[] = [];

    if (type === "educational") {
      requiredEmailDomains = [
        ...new Set(
          (parsed.data.requiredEmailDomains ?? [])
            .map((domain) => normalizeDomainPattern(domain))
            .filter(Boolean),
        ),
      ];
      if (requiredEmailDomains.length === 0) {
        return Response.json(
          {
            success: false,
            message:
              "Add at least one email format for this educational community (e.g. nitk.edu.in or edu.in).",
          },
          { status: 400 },
        );
      }
      const invalid = requiredEmailDomains.find(
        (domain) => !isAllowedSchoolEmail(`student@${domain}`),
      );
      if (invalid) {
        return Response.json(
          {
            success: false,
            message: `"${invalid}" is not a recognised educational email format. Use formats like nitk.edu.in, edu.in or ac.in.`,
          },
          { status: 400 },
        );
      }
    }

    const baseSlug = slugify(parsed.data.name);
    if (!baseSlug) {
      return Response.json(
        {
          success: false,
          message:
            "Community name must contain at least one letter or number.",
        },
        { status: 400 },
      );
    }
    let slug = baseSlug;
    let inviteCode = generateInviteCode();

    let index = 1;
    while (await CommunityModel.findOne({ slug })) {
      slug = `${baseSlug}-${index}`;
      index += 1;
    }
    while (await CommunityModel.findOne({ inviteCode })) {
      inviteCode = generateInviteCode();
    }

    const community = await CommunityModel.create({
      slug,
      name: parsed.data.name,
      description: parsed.data.description,
      avatarColor: parsed.data.avatarColor ?? "#6366f1",
      inviteCode,
      inviteCodeExpiresAt: inviteExpiryFromHours(
        parsed.data.inviteTtlHours === undefined
          ? DEFAULT_INVITE_TTL_HOURS
          : parsed.data.inviteTtlHours,
      ),
      type,
      requiredEmailDomains,
      joinPolicy: parsed.data.joinPolicy ?? "open",
      aiModeration: parsed.data.aiModeration ?? true,
      adminIds: [new mongoose.Types.ObjectId(userId)],
      members: [],
      bannedUserIds: [],
      bannedMembers: [],
      bannedSchoolEmailHashes: [],
    });

    return Response.json(
      {
        success: true,
        message: "Community created successfully",
        community: serializeCommunity(
          community,
          "admin",
          true,
          undefined,
          userId,
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating community", error);
    return Response.json(
      { success: false, message: "Error creating community" },
      { status: 500 },
    );
  }
}

export async function GET() {
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

    return Response.json(
      { success: true, ...(await listCommunitiesForUser(userId)) },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error fetching communities", error);
    return Response.json(
      { success: false, message: "Error fetching communities" },
      { status: 500 },
    );
  }
}
