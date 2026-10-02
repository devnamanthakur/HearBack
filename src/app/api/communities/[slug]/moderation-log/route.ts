import dbConnect from "@/lib/dbConnect";
import CommunityModel from "@/model/Community";
import ModerationLogModel from "@/model/ModerationLog";
import UserModel from "@/model/User";
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
        { success: false, message: "Only admins can view the moderation log" },
        { status: 403 },
      );
    }

    const logs = await ModerationLogModel.find({ communityId: community._id })
      .sort({ createdAt: -1 })
      .limit(100);

    const actorIds = [
      ...new Set(
        logs
          .filter((log) => log.actorId)
          .map((log) => log.actorId!.toString()),
      ),
    ];
    const actors = await UserModel.find({ _id: { $in: actorIds } }).select(
      "_id username",
    );
    const actorNameById = new Map(
      actors.map((actor) => [actor._id.toString(), actor.username]),
    );

    return Response.json(
      {
        success: true,
        entries: logs.map((log) => ({
          _id: log._id.toString(),
          action: log.action,
          detail: log.detail ?? undefined,
          targetType: log.targetType,
          targetId: log.targetId ?? undefined,
          createdAt: log.createdAt,
          actorName: log.actorId
            ? actorNameById.get(log.actorId.toString()) ?? "Faculty"
            : "System",
        })),
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error fetching moderation log", error);
    return Response.json(
      { success: false, message: "Error fetching moderation log" },
      { status: 500 },
    );
  }
}
