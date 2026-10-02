import dbConnect from "@/lib/dbConnect";
import CommunityModel from "@/model/Community";
import JoinRequestModel from "@/model/JoinRequest";
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
        { success: false, message: "Only admins can view join requests" },
        { status: 403 },
      );
    }

    const requests = await JoinRequestModel.find({
      communityId: community._id,
      status: "pending",
    }).sort({ createdAt: 1 });

    return Response.json(
      {
        success: true,
        requests: requests.map((request) => ({
          _id: request._id.toString(),
          nickname: request.nickname,
          createdAt: request.createdAt,
        })),
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error fetching join requests", error);
    return Response.json(
      { success: false, message: "Error fetching join requests" },
      { status: 500 },
    );
  }
}
