import dbConnect from "@/lib/dbConnect";
import CommunityModel from "@/model/Community";
import TopicModel from "@/model/Topic";
import ResponseModel from "@/model/Response";
import ReportModel from "@/model/Report";
import UserModel from "@/model/User";
import { auth } from "@/lib/auth";
import { isAdmin, sameObjectId } from "@/helpers/communityUtils";

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
        { success: false, message: "Only admins can view reports" },
        { status: 403 },
      );
    }

    const url = new URL(request.url);
    const statusParam = url.searchParams.get("status") ?? "pending";
    const filter: Record<string, unknown> = { communityId: community._id };
    if (statusParam !== "all") filter.status = statusParam;

    const reports = await ReportModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(50);

    const topicIds = reports
      .filter((r) => r.targetType === "topic")
      .map((r) => r.targetId);
    const responseIds = reports
      .filter((r) => r.targetType === "response")
      .map((r) => r.targetId);

    const [topics, responses] = await Promise.all([
      TopicModel.find({ _id: { $in: topicIds } }),
      ResponseModel.find({ _id: { $in: responseIds } }),
    ]);

    // Admin-authored content is attributed to the professor, not "Anonymous".
    const adminAuthorIds = [
      ...new Set(
        [...topics, ...responses]
          .filter((doc) => doc.role === "admin")
          .map((doc) => doc.authorId.toString()),
      ),
    ];
    const adminAuthors = adminAuthorIds.length
      ? await UserModel.find({ _id: { $in: adminAuthorIds } }).select(
          "_id username",
        )
      : [];
    const adminNameById = new Map(
      adminAuthors.map((u) => [u._id.toString(), u.username]),
    );

    // Reporters are shown by their community nickname — never by their account
    // username, which would deanonymise the person who filed the report.
    const reporterNicknameById = new Map(
      community.members.map((m) => [m.userId.toString(), m.nickname]),
    );
    const isAdminId = (id: string) =>
      community.adminIds.some((adminId) => sameObjectId(adminId, id));

    const items = reports.map((report) => {
      const topic =
        report.targetType === "topic"
          ? topics.find((t) => t._id.toString() === report.targetId.toString())
          : undefined;
      const response =
        report.targetType === "response"
          ? responses.find(
              (r) => r._id.toString() === report.targetId.toString(),
            )
          : undefined;
      const targetDoc = topic ?? response;
      const reporterId = report.reporterId.toString();

      return {
        _id: report._id.toString(),
        targetType: report.targetType,
        targetId: report.targetId.toString(),
        reason: report.reason,
        note: report.note ?? undefined,
        status: report.status,
        createdAt: report.createdAt,
        actionTaken: report.actionTaken ?? undefined,
        reporterNickname:
          reporterNicknameById.get(reporterId) ??
          (isAdminId(reporterId) ? "Faculty" : "Anonymous"),
        authorNickname:
          targetDoc?.role === "admin"
            ? adminNameById.get(targetDoc.authorId.toString()) ?? "Faculty"
            : targetDoc?.authorNickname ?? "Anonymous",
        authorRole: targetDoc?.role ?? "member",
        targetTitle: topic?.title,
        targetBody: targetDoc?.body ?? "",
        isHidden: targetDoc?.isHidden ?? false,
      };
    });

    return Response.json(
      {
        success: true,
        reports: items,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error fetching reports", error);
    return Response.json(
      { success: false, message: "Error fetching reports" },
      { status: 500 },
    );
  }
}
