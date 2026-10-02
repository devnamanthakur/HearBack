import dbConnect from "@/lib/dbConnect";
import CommunityModel from "@/model/Community";
import { auth } from "@/lib/auth";
import { parseJsonObject } from "@/helpers/parseBody";
import { generateNickname, sameObjectId } from "@/helpers/communityUtils";
import { checkNickname } from "@/lib/moderation";

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

    const body = await parseJsonObject(request);
    const value = typeof body?.nickname === "string" ? body.nickname : null;
    const trimmed = value?.trim().slice(0, 24) ?? "";
    if (!trimmed || !/^[A-Za-z0-9 _-]+$/.test(trimmed)) {
      return Response.json(
        { success: false, message: "Nickname can only contain letters, numbers, spaces, _ and -" },
        { status: 400 },
      );
    }

    const nicknameCheck = checkNickname(trimmed);
    if (!nicknameCheck.ok) {
      return Response.json(
        { success: false, message: nicknameCheck.message },
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

    if (community.adminIds.some((id) => sameObjectId(id, userId))) {
      return Response.json(
        { success: false, message: "Admins do not use anonymous nicknames" },
        { status: 400 },
      );
    }

    const member = community.members.find((m) => sameObjectId(m.userId, userId));
    if (!member) {
      return Response.json(
        { success: false, message: "Join this community first" },
        { status: 403 },
      );
    }

    const taken = community.members.some(
      (m) => !sameObjectId(m.userId, userId) && m.nickname === trimmed,
    );
    if (taken) {
      return Response.json(
        {
          success: false,
          message: "That nickname is already taken",
          suggestion: generateNickname(),
        },
        { status: 400 },
      );
    }

    member.nickname = trimmed;
    await community.save();

    return Response.json(
      { success: true, message: "Nickname updated", nickname: trimmed },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error updating nickname", error);
    return Response.json(
      { success: false, message: "Error updating nickname" },
      { status: 500 },
    );
  }
}