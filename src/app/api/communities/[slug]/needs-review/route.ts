import dbConnect from "@/lib/dbConnect";
import CommunityModel from "@/model/Community";
import TopicModel from "@/model/Topic";
import ResponseModel from "@/model/Response";
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
        { success: false, message: "Only admins can view the review queue" },
        { status: 403 },
      );
    }

    const [topics, responses] = await Promise.all([
      TopicModel.find({ communityId: community._id, needsReview: true }).sort({
        createdAt: -1,
      }),
      ResponseModel.find({ communityId: community._id, needsReview: true }).sort(
        { createdAt: -1 },
      ),
    ]);

    const topicItems = topics.map((topic) => ({
      _id: topic._id.toString(),
      targetType: "topic" as const,
      title: topic.title,
      body: topic.body,
      authorNickname: topic.authorNickname ?? "Anonymous",
      authorRole: topic.role,
      isHidden: topic.isHidden ?? false,
      createdAt: topic.createdAt,
    }));

    const responseItems = responses.map((response) => ({
      _id: response._id.toString(),
      targetType: "response" as const,
      title: undefined,
      body: response.body,
      authorNickname: response.authorNickname ?? "Anonymous",
      authorRole: response.role,
      isHidden: response.isHidden ?? false,
      createdAt: response.createdAt,
    }));

    const items = [...topicItems, ...responseItems].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );

    return Response.json({ success: true, items }, { status: 200 });
  } catch (error) {
    console.error("Error fetching review queue", error);
    return Response.json(
      { success: false, message: "Error fetching review queue" },
      { status: 500 },
    );
  }
}
