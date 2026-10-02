import dbConnect from "@/lib/dbConnect";
import UserModel from "@/model/User";
import { auth } from "@/lib/auth";
import { acceptMessageSchema } from "@/schema/acceptMessageSchema";
import { parseJsonObject } from "@/helpers/parseBody";

export async function PATCH(request: Request) {
  try {
    await dbConnect();
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json(
        { success: false, message: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = await parseJsonObject(request);

    if (!body) {
      return Response.json(
        {
          success: false,
          message:
            "Invalid request body. Expected a JSON object with acceptMessage.",
        },
        { status: 400 },
      );
    }

    const parsed = acceptMessageSchema.safeParse(body);

    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => issue.message);
      return Response.json(
        { success: false, message: issues.join(", ") },
        { status: 400 },
      );
    }

    const { acceptMessage } = parsed.data;

    const result = await UserModel.updateOne(
      { _id: session.user.id },
      { $set: { isAcceptingMessage: acceptMessage } },
    );

    if (result.matchedCount === 0) {
      return Response.json(
        { success: false, message: "User not found" },
        { status: 404 },
      );
    }

    return Response.json(
      {
        success: true,
        message: "Message acceptance status updated",
        isAcceptingMessage: acceptMessage,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error updating acceptance status", error);
    return Response.json(
      { success: false, message: "Error updating acceptance status" },
      { status: 500 },
    );
  }
}