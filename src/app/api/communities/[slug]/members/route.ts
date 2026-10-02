import dbConnect from "@/lib/dbConnect";
import CommunityModel from "@/model/Community";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/helpers/communityUtils";

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
        { success: false, message: "Only admins can view members" },
        { status: 403 },
      );
    }

    const now = Date.now();
    const members = community.members
      .map((member) => ({
        userId: member.userId.toString(),
        nickname: member.nickname,
        joinedAt: member.joinedAt,
        strikes: member.strikes ?? 0,
        mutedUntil:
          member.mutedUntil && member.mutedUntil.getTime() > now
            ? member.mutedUntil
            : undefined,
      }))
      .sort((a, b) => b.joinedAt.getTime() - a.joinedAt.getTime());

    const banned = community.bannedUserIds.map((id) => id.toString());

    return Response.json(
      { success: true, members, banned, memberCount: members.length + community.adminIds.length },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error fetching members", error);
    return Response.json(
      { success: false, message: "Error fetching members" },
      { status: 500 },
    );
  }
}
