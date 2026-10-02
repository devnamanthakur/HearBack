import dbConnect from "@/lib/dbConnect";
import CommunityModel from "@/model/Community";
import UserModel from "@/model/User";
import { auth } from "@/lib/auth";
import { parseJsonObject } from "@/helpers/parseBody";
import {
  getRole,
  isAdmin,
  getMemberNickname,
  generateInviteCode,
  sameObjectId,
} from "@/helpers/communityUtils";
import { serializeCommunity } from "@/lib/communityQueries";
import { logModeration } from "@/lib/moderationLog";
import {
  isAllowedSchoolEmail,
  normalizeDomainPattern,
} from "@/helpers/emailDomains";
import { inviteExpiryFromHours, resolveInviteTtl } from "@/helpers/inviteTtl";

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

    const role = getRole(community, userId);
    const viewer = await UserModel.findById(userId).select("schoolDomain");

    return Response.json(
      {
        success: true,
        community: serializeCommunity(
          community,
          role,
          isAdmin(community, userId),
          getMemberNickname(community, userId),
          userId,
          viewer?.schoolDomain ?? undefined,
        ),
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error fetching community", error);
    return Response.json(
      { success: false, message: "Error fetching community" },
      { status: 500 },
    );
  }
}

export async function PATCH(
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

    const community = await CommunityModel.findOne({ slug });
    if (!community) {
      return Response.json(
        { success: false, message: "Community not found" },
        { status: 404 },
      );
    }
    if (!isAdmin(community, userId)) {
      return Response.json(
        { success: false, message: "Only admins can change settings" },
        { status: 403 },
      );
    }

    const body = await parseJsonObject(request);
    const action = typeof body?.action === "string" ? body.action : "";

    switch (action) {
      case "rotate_invite": {
        const ttl = resolveInviteTtl(body?.ttlHours);
        if (!ttl.ok) {
          return Response.json(
            {
              success: false,
              message:
                "ttlHours must be a positive whole number of hours, null for never, or omitted to keep the current expiry.",
            },
            { status: 400 },
          );
        }
        let inviteCode = generateInviteCode();
        while (await CommunityModel.findOne({ inviteCode })) {
          inviteCode = generateInviteCode();
        }
        community.inviteCode = inviteCode;
        if (!ttl.keep) {
          community.inviteCodeExpiresAt = inviteExpiryFromHours(ttl.hours);
        }
        await community.save();
        await logModeration({
          communityId: community._id,
          actorId: userId,
          action: "invite_rotated",
          targetType: "community",
        });
        return Response.json(
          {
            success: true,
            message: "Invite code rotated",
            inviteCode,
            inviteCodeExpiresAt: community.inviteCodeExpiresAt ?? null,
          },
          { status: 200 },
        );
      }
      case "set_invite_expiry": {
        const ttl = resolveInviteTtl(body?.ttlHours);
        if (!ttl.ok || ttl.keep) {
          return Response.json(
            {
              success: false,
              message:
                "ttlHours must be a positive whole number of hours or null for never.",
            },
            { status: 400 },
          );
        }
        community.inviteCodeExpiresAt = inviteExpiryFromHours(ttl.hours);
        await community.save();
        await logModeration({
          communityId: community._id,
          actorId: userId,
          action: "invite_expiry_updated",
          targetType: "community",
          detail: community.inviteCodeExpiresAt
            ? `Expires ${community.inviteCodeExpiresAt.toISOString()}`
            : "Never expires",
        });
        return Response.json(
          {
            success: true,
            message: community.inviteCodeExpiresAt
              ? "Invite code expiry updated"
              : "Invite code will never expire",
            inviteCodeExpiresAt: community.inviteCodeExpiresAt ?? null,
          },
          { status: 200 },
        );
      }
      case "set_ai_moderation": {
        if (typeof body?.enabled !== "boolean") {
          return Response.json(
            { success: false, message: "enabled boolean is required" },
            { status: 400 },
          );
        }
        community.aiModeration = body.enabled;
        await community.save();
        await logModeration({
          communityId: community._id,
          actorId: userId,
          action: body.enabled
            ? "ai_moderation_enabled"
            : "ai_moderation_disabled",
          targetType: "community",
        });
        return Response.json(
          {
            success: true,
            message: body.enabled
              ? "AI moderation enabled"
              : "AI moderation disabled",
            aiModeration: community.aiModeration,
          },
          { status: 200 },
        );
      }
      case "set_approval": {
        if (typeof body?.enabled !== "boolean") {
          return Response.json(
            { success: false, message: "enabled boolean is required" },
            { status: 400 },
          );
        }
        community.joinPolicy = body.enabled ? "approval" : "open";
        await community.save();
        await logModeration({
          communityId: community._id,
          actorId: userId,
          action: body.enabled ? "approval_enabled" : "approval_disabled",
          targetType: "community",
        });
        return Response.json(
          {
            success: true,
            message: body.enabled
              ? "New members now need approval"
              : "Anyone with the code can join",
            joinPolicy: community.joinPolicy,
          },
          { status: 200 },
        );
      }
      case "set_required_domains": {
        if (community.type !== "educational") {
          return Response.json(
            {
              success: false,
              message: "Only educational communities use email formats",
            },
            { status: 400 },
          );
        }
        const domains = Array.isArray(body?.domains)
          ? [
              ...new Set(
                body.domains
                  .filter((d): d is string => typeof d === "string")
                  .map((d) => normalizeDomainPattern(d))
                  .filter(Boolean),
              ),
            ]
          : [];
        if (domains.length === 0) {
          return Response.json(
            { success: false, message: "Add at least one email format" },
            { status: 400 },
          );
        }
        const invalid = domains.find(
          (domain) => !isAllowedSchoolEmail(`student@${domain}`),
        );
        if (invalid) {
          return Response.json(
            {
              success: false,
              message: `"${invalid}" is not a recognised educational email format.`,
            },
            { status: 400 },
          );
        }
        community.requiredEmailDomains = domains;
        await community.save();
        await logModeration({
          communityId: community._id,
          actorId: userId,
          action: "required_domains_updated",
          targetType: "community",
          detail: domains.join(", "),
        });
        return Response.json(
          {
            success: true,
            message: "Required email formats updated",
            requiredEmailDomains: community.requiredEmailDomains,
          },
          { status: 200 },
        );
      }
      case "remove_member": {
        const memberId =
          typeof body?.userId === "string" ? body.userId : "";
        community.members = community.members.filter(
          (member) => !sameObjectId(member.userId, memberId),
        );
        await community.save();
        await logModeration({
          communityId: community._id,
          actorId: userId,
          action: "member_removed",
          targetType: "member",
          targetId: memberId,
        });
        return Response.json(
          { success: true, message: "Member removed" },
          { status: 200 },
        );
      }
      default:
        return Response.json(
          {
            success: false,
            message:
              "Unknown action. Use rotate_invite, set_invite_expiry, set_ai_moderation, set_approval, set_required_domains or remove_member.",
          },
          { status: 400 },
        );
    }
  } catch (error) {
    console.error("Error updating community", error);
    return Response.json(
      { success: false, message: "Error updating community" },
      { status: 500 },
    );
  }
}
